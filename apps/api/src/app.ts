import { createHmac, timingSafeEqual } from 'node:crypto'
import { PassThrough } from 'node:stream'
import Anthropic from '@anthropic-ai/sdk'
import type { Db } from '@askly/db'
import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import { z } from 'zod'
import {
  createRespondent,
  deleteForm,
  exportAnswers,
  formOrThrow,
  getRespondentDetail,
  HttpError,
  listFormSummaries,
  listRespondents,
  putForm,
} from './admin.ts'
import { pendingQuestion, runTurn, visibleMessages } from './ai.ts'
import {
  allQuestions,
  type ChatEvent,
  type Form,
  formatAnswer,
  MAX_FILE_SIZE,
  missingRequired,
  STATUS_LABELS,
  validateAnswer,
} from './domain.ts'
import {
  addImage,
  addRespondentFile,
  type FileRow,
  fileInfos,
  findFile,
  requireStorage,
  saveFileAnswer,
  type Upload,
} from './files.ts'
import { registerMcp } from './mcp.ts'
import { createLoginLimiter, createSigner, registerOAuth, verifyAccessToken } from './oauth.ts'
import type { Storage } from './storage.ts'
import {
  findRespondentByToken,
  loadAnswers,
  loadMessages,
  markSubmitted,
  type Respondent,
  saveAnswer,
} from './store.ts'

export interface AppOptions {
  db: Db
  anthropic: Anthropic
  adminPassword: string
  /** Jeton pour piloter l'admin par l'API (skill de Claude) ; absent = API admin par cookie seulement. */
  apiToken?: string
  /** Adresse publique de l'app (ex. https://ask.tnemelc.fr), pour les liens renvoyés. */
  publicUrl?: string
  logger?: boolean | object
  /** Dossier du front compilé, servi sur le même domaine (production). */
  webDist?: string
  /** Stockage S3 des images et fichiers joints ; absent, ces fonctions répondent 503. */
  storage?: Storage
}

const ADMIN_COOKIE = 'admin_session'
const MAX_MESSAGE_LENGTH = 2000
/** Garde-fou de coût : au-delà, la conversation est manifestement détournée. */
const MAX_USER_MESSAGES = 150

/** E-mail facultatif : le lien peut partir par WhatsApp ; `""` vaut absent. */
const optionalEmail = z
  .union([z.email().max(320), z.literal('').transform(() => undefined)])
  .optional()

export function buildApp({
  db,
  anthropic,
  adminPassword,
  apiToken,
  publicUrl,
  logger = false,
  webDist,
  storage,
}: AppOptions) {
  // trustProxy : derrière Traefik (Dokploy), pour l'IP et le protocole réels.
  const app = Fastify({ logger, trustProxy: true })
  app.register(cookie)
  // Un fichier par requête ; au-delà de la taille maximale, `toBuffer()` lève une erreur 413.
  app.register(multipart, { limits: { fileSize: MAX_FILE_SIZE, files: 1, fields: 0 } })

  app.get('/api/health', async () => ({ ok: true }))

  if (webDist) {
    app.register(fastifyStatic, { root: webDist, wildcard: false })
    // Application monopage : toute route hors /api (et hors découverte OAuth) renvoie index.html.
    app.setNotFoundHandler((req, reply) =>
      req.method === 'GET' && !req.url.startsWith('/api/') && !req.url.startsWith('/.well-known/')
        ? reply.sendFile('index.html')
        : reply.code(404).send({ error: 'Introuvable' }),
    )
  }

  // Jeton de session admin = HMAC du mot de passe : changer ADMIN_PASSWORD déconnecte tout le monde.
  const sessionToken = createHmac('sha256', adminPassword).update('admin-session').digest('hex')
  const signer = createSigner(adminPassword)
  // Partagé par la connexion admin et la page d'autorisation OAuth.
  const limiter = createLoginLimiter()
  const safeEqual = (a: string, b: string) => {
    const [x, y] = [Buffer.from(a), Buffer.from(b)]
    return x.length === y.length && timingSafeEqual(x, y)
  }

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof z.ZodError) {
      return reply.code(400).send({ error: z.prettifyError(err) })
    }
    if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message })
    app.log.error(err)
    return reply.code(500).send({ error: 'Erreur interne' })
  })

  function requireAdmin(req: FastifyRequest) {
    const bearer = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1]
    if (apiToken && bearer && safeEqual(bearer, apiToken)) return
    const value = req.cookies[ADMIN_COOKIE]
    if (!value || !safeEqual(value, sessionToken)) throw new HttpError(401, 'Non connecté')
  }

  /** Liens publics : `PUBLIC_URL`, sinon le domaine par lequel on a été appelé (trustProxy). */
  const origin = (req: FastifyRequest) => publicUrl ?? `${req.protocol}://${req.host}`

  async function respondentOrThrow(token: string): Promise<{ respondent: Respondent; form: Form }> {
    const respondent = await findRespondentByToken(db, token)
    if (!respondent) throw new HttpError(404, 'Lien invalide')
    return { respondent, form: await formOrThrow(db, respondent.formId) }
  }

  async function conversation(form: Form, respondentId: string) {
    const rows = await loadMessages(db, respondentId)
    const answers = await loadAnswers(db, respondentId)
    return {
      answers,
      files: await fileInfos(db, respondentId),
      messages: visibleMessages(rows),
      pending: pendingQuestion(form, rows, answers),
    }
  }

  const tokenParams = z.object({ token: z.string().min(1).max(100) })

  // ─── Répondant ─────────────────────────────────────────────────────────────

  app.get('/api/r/:token', async (req) => {
    const { respondent, form } = await respondentOrThrow(tokenParams.parse(req.params).token)
    return {
      form,
      respondent: { name: respondent.name, submittedAt: respondent.submittedAt },
      ...(await conversation(form, respondent.id)),
    }
  })

  // Un tour à la fois par répondant, sinon deux tours entremêlent leurs appels d'outils.
  // shortcut: verrou en mémoire, valable pour une seule instance de l'API ; passer à un verrou Postgres (pg_advisory_lock) si on en lance plusieurs.
  const busy = new Set<string>()

  app.post('/api/r/:token/chat', async (req, reply) => {
    const { respondent, form } = await respondentOrThrow(tokenParams.parse(req.params).token)
    const { message } = z
      .object({ message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH).nullable() })
      .parse(req.body)
    if (respondent.submittedAt) throw new HttpError(409, 'Réponses déjà envoyées')
    const history = await loadMessages(db, respondent.id)
    // `null` = ouverture de la conversation, une seule fois.
    if (message === null && history.length > 0) return reply.code(204).send()
    if (
      history.filter((m) => m.display !== null && m.role === 'user').length >= MAX_USER_MESSAGES
    ) {
      throw new HttpError(429, 'Trop de messages pour ce questionnaire')
    }
    if (busy.has(respondent.id)) throw new HttpError(409, 'Une réponse est déjà en cours')
    busy.add(respondent.id)

    // Flux NDJSON : un événement `ChatEvent` par ligne.
    const out = new PassThrough()
    const emit = (e: ChatEvent) => out.write(`${JSON.stringify(e)}\n`)
    reply.header('content-type', 'application/x-ndjson; charset=utf-8')
    reply.header('cache-control', 'no-store')
    reply.send(out)

    runTurn({ db, client: anthropic, form, respondent, message, emit })
      .catch((err) => {
        req.log.error(err)
        emit({
          type: 'error',
          message:
            err instanceof Anthropic.APIError
              ? "L'assistant est momentanément indisponible. Réessayez dans un instant."
              : 'Une erreur est survenue. Réessayez.',
        })
      })
      .finally(() => {
        busy.delete(respondent.id)
        emit({ type: 'done' })
        out.end()
      })
    return reply
  })

  app.put('/api/r/:token/answers/:questionId', async (req) => {
    const { token, questionId } = tokenParams
      .extend({ questionId: z.string().max(100) })
      .parse(req.params)
    const { respondent, form } = await respondentOrThrow(token)
    if (respondent.submittedAt) throw new HttpError(409, 'Réponses déjà envoyées')
    const { value } = z.object({ value: z.unknown() }).parse(req.body)
    const question = allQuestions(form).find((q) => q.id === questionId)
    if (question?.type === 'file') {
      // On ne peut que retirer des fichiers ici (liste vide : tout retirer) ; on en ajoute par l'envoi.
      const ids = Array.isArray(value) && value.length === 0 ? null : value
      const result = ids === null ? null : validateAnswer(form, questionId, ids)
      if (result && !result.ok) throw new HttpError(400, result.error)
      await saveFileAnswer(
        db,
        storage,
        respondent.id,
        questionId,
        result ? (result.value as string[]) : null,
      )
    } else {
      const result = validateAnswer(form, questionId, value)
      if (!result.ok) throw new HttpError(400, result.error)
      await saveAnswer(db, respondent.id, questionId, result.value, 'manual')
    }
    return {
      answers: await loadAnswers(db, respondent.id),
      files: await fileInfos(db, respondent.id),
    }
  })

  // Fichier joint à une question `file` (multipart, un fichier).
  app.post('/api/r/:token/files/:questionId', async (req) => {
    const { token, questionId } = tokenParams
      .extend({ questionId: z.string().max(100) })
      .parse(req.params)
    const { respondent, form } = await respondentOrThrow(token)
    if (respondent.submittedAt) throw new HttpError(409, 'Réponses déjà envoyées')
    const file = await readUpload(req)
    const added = await addRespondentFile(db, storage, form, respondent.id, questionId, file)
    return {
      file: added,
      answers: await loadAnswers(db, respondent.id),
      files: await fileInfos(db, respondent.id),
    }
  })

  // Le répondant retélécharge un de ses fichiers.
  app.get('/api/r/:token/files/:fileId', async (req, reply) => {
    const { token, fileId } = tokenParams.extend({ fileId: z.uuid() }).parse(req.params)
    const { respondent } = await respondentOrThrow(token)
    const file = await findFile(db, fileId)
    if (file.respondentId !== respondent.id) throw new HttpError(404, 'Fichier introuvable')
    return redirectToFile(reply, file)
  })

  // Images des questionnaires : publiques (id non devinable), servies par lien signé.
  app.get('/api/images/:id', async (req, reply) => {
    const { id } = z.object({ id: z.uuid() }).parse(req.params)
    const file = await findFile(db, id)
    if (file.kind !== 'image') throw new HttpError(404, 'Image introuvable')
    reply.header('cache-control', 'public, max-age=1800')
    return redirectToFile(reply, file, true)
  })

  async function readUpload(req: FastifyRequest): Promise<Upload> {
    if (!req.isMultipart()) throw new HttpError(400, 'Envoi multipart/form-data attendu')
    const part = await req.file()
    if (!part) throw new HttpError(400, 'Aucun fichier reçu')
    try {
      return { filename: part.filename, contentType: part.mimetype, body: await part.toBuffer() }
    } catch {
      throw new HttpError(413, `Fichier trop lourd (${MAX_FILE_SIZE / 1024 / 1024} Mo maximum)`)
    }
  }

  async function redirectToFile(reply: FastifyReply, file: FileRow, inline = false) {
    const url = await requireStorage(storage).signedUrl(file.key, file.filename, {
      inline: inline || file.contentType.startsWith('image/'),
    })
    return reply.redirect(url, 302)
  }

  app.post('/api/r/:token/submit', async (req) => {
    const { respondent, form } = await respondentOrThrow(tokenParams.parse(req.params).token)
    const missing = missingRequired(form, await loadAnswers(db, respondent.id))
    if (missing.length > 0) {
      throw new HttpError(
        400,
        `Questions obligatoires sans réponse : ${missing.map((q) => q.label).join(', ')}`,
      )
    }
    if (!(await markSubmitted(db, respondent.id)))
      throw new HttpError(409, 'Réponses déjà envoyées')
    return { ok: true }
  })

  // ─── Admin ─────────────────────────────────────────────────────────────────

  app.post('/api/admin/login', async (req, reply) => {
    const { password } = z.object({ password: z.string().max(200) }).parse(req.body)
    if (limiter.blocked()) throw new HttpError(429, 'Trop de tentatives, réessayez plus tard')
    if (!safeEqual(password, adminPassword)) {
      limiter.fail()
      throw new HttpError(401, 'Mot de passe incorrect')
    }
    reply.setCookie(ADMIN_COOKIE, sessionToken, {
      path: '/api/admin',
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 30,
    })
    return { ok: true }
  })

  app.post('/api/admin/logout', async (_req, reply) => {
    reply.clearCookie(ADMIN_COOKIE, { path: '/api/admin' })
    return { ok: true }
  })

  app.get('/api/admin/me', async (req) => {
    requireAdmin(req)
    return { ok: true }
  })

  const formParams = z.object({ formId: z.string() })

  app.get('/api/admin/forms', async (req) => {
    requireAdmin(req)
    return listFormSummaries(db)
  })

  app.get('/api/admin/forms/:formId', async (req) => {
    requireAdmin(req)
    const form = await formOrThrow(db, formParams.parse(req.params).formId)
    return { form, respondents: await listRespondents(db, form, origin(req)) }
  })

  app.put('/api/admin/forms/:formId', async (req) => {
    requireAdmin(req)
    const { formId } = formParams.parse(req.params)
    const body = z
      .object({ definition: z.unknown(), reusable: z.boolean().optional() })
      .parse(req.body)
    const saved = await putForm(db, formId, body.definition, body.reusable, 'upsert')
    return { ...saved, adminUrl: `${origin(req)}/admin/forms/${saved.id}` }
  })

  app.delete('/api/admin/forms/:formId', async (req) => {
    requireAdmin(req)
    return deleteForm(db, storage, formParams.parse(req.params).formId)
  })

  app.post('/api/admin/forms/:formId/respondents', async (req) => {
    requireAdmin(req)
    const body = z
      .object({ name: z.string().trim().min(1).max(200), email: optionalEmail })
      .parse(req.body)
    return createRespondent(db, formParams.parse(req.params).formId, body, origin(req))
  })

  app.get('/api/admin/respondents/:id', async (req) => {
    requireAdmin(req)
    const { id } = z.object({ id: z.uuid() }).parse(req.params)
    return getRespondentDetail(db, id, origin(req))
  })

  app.get('/api/admin/files/:id', async (req, reply) => {
    requireAdmin(req)
    const { id } = z.object({ id: z.uuid() }).parse(req.params)
    return redirectToFile(reply, await findFile(db, id))
  })

  // Image pour un questionnaire (multipart) ; renvoie l'adresse à mettre dans `image.url`.
  app.post('/api/admin/images', async (req) => {
    requireAdmin(req)
    return addImage(db, storage, await readUpload(req), origin(req))
  })

  app.get('/api/admin/forms/:formId/export', async (req, reply) => {
    requireAdmin(req)
    const form = await formOrThrow(db, formParams.parse(req.params).formId)
    const { format } = z.object({ format: z.enum(['json', 'csv']) }).parse(req.query)
    const rows = await exportAnswers(db, form)
    sendDownload(reply, `${form.id}.${format}`)
    if (format === 'json') {
      return rows.map(({ respondent: r, status, answers, files }) => ({
        name: r.name,
        email: r.email,
        status,
        submittedAt: r.submittedAt,
        answers,
        // Fichiers joints : nom et lien de téléchargement (connexion admin requise).
        files: Object.values(files)
          .filter((f) => f.respondentId === r.id)
          .map((f) => ({
            questionId: f.questionId,
            filename: f.filename,
            url: `${origin(req)}/api/admin/files/${f.id}`,
          })),
      }))
    }
    const questions = allQuestions(form)
    const header = ['Nom', 'E-mail', 'Statut', 'Envoyé le', ...questions.map((q) => q.label)]
    const lines = rows.map(({ respondent: r, status, answers: a, files }) => [
      r.name,
      r.email ?? '',
      STATUS_LABELS[status],
      r.submittedAt?.toISOString() ?? '',
      // Nombres bruts : un tableur les lit comme des nombres, pas comme du texte « 3 000 ».
      ...questions.map((q) =>
        q.type === 'number'
          ? String(a[q.id] ?? '')
          : q.type === 'file' && Array.isArray(a[q.id])
            ? (a[q.id] as string[])
                .map((id) => `${files[id]?.filename ?? id} (${origin(req)}/api/admin/files/${id})`)
                .join(' ; ')
            : formatAnswer(q, a[q.id]),
      ),
    ])
    // BOM : Excel ouvre alors le fichier en UTF-8 (accents intacts).
    return `\uFEFF${[header, ...lines].map(toCsvLine).join('\r\n')}\r\n`
  })

  // ─── MCP et OAuth (connecteur claude.ai) ──────────────────────────────────

  registerOAuth(app, { adminPassword, origin, signer, safeEqual, limiter })
  registerMcp(app, {
    db,
    storage,
    origin,
    authorize: (req) => {
      const bearer = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1]
      if (!bearer) return false
      return Boolean(apiToken && safeEqual(bearer, apiToken)) || verifyAccessToken(signer, bearer)
    },
  })

  return app
}

function sendDownload(reply: FastifyReply, filename: string) {
  reply.header('content-disposition', `attachment; filename="${filename}"`)
  if (filename.endsWith('.csv')) reply.type('text/csv; charset=utf-8')
}

export function toCsvLine(cells: string[]): string {
  return cells.map((c) => (/[",;\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')
}
