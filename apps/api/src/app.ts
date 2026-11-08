import { createHmac, timingSafeEqual } from 'node:crypto'
import { PassThrough } from 'node:stream'
import Anthropic from '@anthropic-ai/sdk'
import cookie from '@fastify/cookie'
import fastifyStatic from '@fastify/static'
import type { Db } from '@questionnaire/db'
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
  missingRequired,
  STATUS_LABELS,
  validateAnswer,
} from './domain.ts'
import { registerMcp } from './mcp.ts'
import { createLoginLimiter, createSigner, registerOAuth, verifyAccessToken } from './oauth.ts'
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
}: AppOptions) {
  // trustProxy : derrière Traefik (Dokploy), pour l'IP et le protocole réels.
  const app = Fastify({ logger, trustProxy: true })
  app.register(cookie)

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
    const result = validateAnswer(form, questionId, value)
    if (!result.ok) throw new HttpError(400, result.error)
    await saveAnswer(db, respondent.id, questionId, result.value, 'manual')
    return { answers: await loadAnswers(db, respondent.id) }
  })

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
    return deleteForm(db, formParams.parse(req.params).formId)
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

  app.get('/api/admin/forms/:formId/export', async (req, reply) => {
    requireAdmin(req)
    const form = await formOrThrow(db, formParams.parse(req.params).formId)
    const { format } = z.object({ format: z.enum(['json', 'csv']) }).parse(req.query)
    const rows = await exportAnswers(db, form)
    sendDownload(reply, `${form.id}.${format}`)
    if (format === 'json') {
      return rows.map(({ respondent: r, status, answers }) => ({
        name: r.name,
        email: r.email,
        status,
        submittedAt: r.submittedAt,
        answers,
      }))
    }
    const questions = allQuestions(form)
    const header = ['Nom', 'E-mail', 'Statut', 'Envoyé le', ...questions.map((q) => q.label)]
    const lines = rows.map(({ respondent: r, status, answers: a }) => [
      r.name,
      r.email ?? '',
      STATUS_LABELS[status],
      r.submittedAt?.toISOString() ?? '',
      // Nombres bruts : un tableur les lit comme des nombres, pas comme du texte « 3 000 ».
      ...questions.map((q) =>
        q.type === 'number' ? String(a[q.id] ?? '') : formatAnswer(q, a[q.id]),
      ),
    ])
    // BOM : Excel ouvre alors le fichier en UTF-8 (accents intacts).
    return `\uFEFF${[header, ...lines].map(toCsvLine).join('\r\n')}\r\n`
  })

  // ─── MCP et OAuth (connecteur claude.ai) ──────────────────────────────────

  registerOAuth(app, { adminPassword, origin, signer, safeEqual, limiter })
  registerMcp(app, {
    db,
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
