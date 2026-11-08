import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { PassThrough } from 'node:stream'
import Anthropic from '@anthropic-ai/sdk'
import cookie from '@fastify/cookie'
import fastifyStatic from '@fastify/static'
import { answers, type Db, respondents } from '@questionnaire/db'
import { count, desc, eq } from 'drizzle-orm'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import { z } from 'zod'
import { runTurn, visibleMessages } from './ai.ts'
import {
  type Answers,
  allQuestions,
  type ChatEvent,
  type Form,
  formatAnswer,
  missingRequired,
  respondentStatus,
  STATUS_LABELS,
  validateAnswer,
} from './domain.ts'
import { getForm, listForms } from './forms.ts'
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
  logger?: boolean | object
  /** Dossier du front compilé, servi sur le même domaine (production). */
  webDist?: string
}

const ADMIN_COOKIE = 'admin_session'
const MAX_MESSAGE_LENGTH = 2000
/** Garde-fou de coût : au-delà, la conversation est manifestement détournée. */
const MAX_USER_MESSAGES = 150

// Pas de propriété de constructeur : Node exécute ces sources TS en retirant les types, sans transformer.
class HttpError extends Error {
  readonly statusCode: number
  constructor(statusCode: number, message: string) {
    super(message)
    this.statusCode = statusCode
  }
}

export function buildApp({ db, anthropic, adminPassword, logger = false, webDist }: AppOptions) {
  // trustProxy : derrière Traefik (Dokploy), pour l'IP et le protocole réels.
  const app = Fastify({ logger, trustProxy: true })
  app.register(cookie)

  app.get('/api/health', async () => ({ ok: true }))

  if (webDist) {
    app.register(fastifyStatic, { root: webDist, wildcard: false })
    // Application monopage : toute route hors /api renvoie index.html.
    app.setNotFoundHandler((req, reply) =>
      req.method === 'GET' && !req.url.startsWith('/api/')
        ? reply.sendFile('index.html')
        : reply.code(404).send({ error: 'Introuvable' }),
    )
  }

  // Jeton de session admin = HMAC du mot de passe : changer ADMIN_PASSWORD déconnecte tout le monde.
  const sessionToken = createHmac('sha256', adminPassword).update('admin-session').digest('hex')
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
    const value = req.cookies[ADMIN_COOKIE]
    if (!value || !safeEqual(value, sessionToken)) throw new HttpError(401, 'Non connecté')
  }

  function formOrThrow(id: string): Form {
    const form = getForm(id)
    if (!form) throw new HttpError(404, 'Questionnaire introuvable')
    return form
  }

  async function respondentOrThrow(token: string): Promise<{ respondent: Respondent; form: Form }> {
    const respondent = await findRespondentByToken(db, token)
    if (!respondent) throw new HttpError(404, 'Lien invalide')
    return { respondent, form: formOrThrow(respondent.formId) }
  }

  const tokenParams = z.object({ token: z.string().min(1).max(100) })

  // ─── Répondant ─────────────────────────────────────────────────────────────

  app.get('/api/r/:token', async (req) => {
    const { respondent, form } = await respondentOrThrow(tokenParams.parse(req.params).token)
    return {
      form,
      respondent: { name: respondent.name, submittedAt: respondent.submittedAt },
      answers: await loadAnswers(db, respondent.id),
      messages: visibleMessages(await loadMessages(db, respondent.id)),
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
    if (!safeEqual(password, adminPassword)) throw new HttpError(401, 'Mot de passe incorrect')
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

  app.get('/api/admin/forms', async (req) => {
    requireAdmin(req)
    const rows = await db.select().from(respondents)
    return listForms().map((form) => {
      const mine = rows.filter((r) => r.formId === form.id)
      const statuses = mine.map(respondentStatus)
      return {
        id: form.id,
        title: form.title,
        intro: form.intro,
        questionCount: allQuestions(form).length,
        respondents: mine.length,
        done: statuses.filter((s) => s === 'done').length,
        inProgress: statuses.filter((s) => s === 'in_progress').length,
      }
    })
  })

  app.get('/api/admin/forms/:formId', async (req) => {
    requireAdmin(req)
    const form = formOrThrow(z.object({ formId: z.string() }).parse(req.params).formId)
    const rows = await db
      .select({ respondent: respondents, answered: count(answers.questionId) })
      .from(respondents)
      .leftJoin(answers, eq(answers.respondentId, respondents.id))
      .where(eq(respondents.formId, form.id))
      .groupBy(respondents.id)
      .orderBy(desc(respondents.createdAt))
    return {
      form,
      respondents: rows.map(({ respondent, answered }) => ({
        ...respondent,
        status: respondentStatus(respondent),
        answered,
      })),
    }
  })

  app.post('/api/admin/forms/:formId/respondents', async (req) => {
    requireAdmin(req)
    const form = formOrThrow(z.object({ formId: z.string() }).parse(req.params).formId)
    const body = z
      .object({ name: z.string().trim().min(1).max(200), email: z.email().max(320) })
      .parse(req.body)
    const [created] = await db
      .insert(respondents)
      // 32 octets aléatoires : le lien est le seul secret du répondant.
      .values({ ...body, formId: form.id, token: randomBytes(32).toString('base64url') })
      .returning()
    return created
  })

  app.get('/api/admin/respondents/:id', async (req) => {
    requireAdmin(req)
    const { id } = z.object({ id: z.uuid() }).parse(req.params)
    const respondent = await db.query.respondents.findFirst({ where: eq(respondents.id, id) })
    if (!respondent) throw new HttpError(404, 'Répondant introuvable')
    return {
      respondent: { ...respondent, status: respondentStatus(respondent) },
      form: formOrThrow(respondent.formId),
      answers: await loadAnswers(db, respondent.id),
      messages: visibleMessages(await loadMessages(db, respondent.id)),
    }
  })

  app.get('/api/admin/forms/:formId/export', async (req, reply) => {
    requireAdmin(req)
    const form = formOrThrow(z.object({ formId: z.string() }).parse(req.params).formId)
    const { format } = z.object({ format: z.enum(['json', 'csv']) }).parse(req.query)
    const rows = await db.select().from(respondents).where(eq(respondents.formId, form.id))
    const all = (
      await db
        .select({ a: answers })
        .from(answers)
        .innerJoin(respondents, eq(answers.respondentId, respondents.id))
        .where(eq(respondents.formId, form.id))
    ).map((r) => r.a)
    const byRespondent = (id: string): Answers =>
      Object.fromEntries(
        all.filter((a) => a.respondentId === id).map((a) => [a.questionId, a.value]),
      )
    const questions = allQuestions(form)
    sendDownload(reply, `${form.id}.${format}`)
    if (format === 'json') {
      return rows.map((r) => ({
        name: r.name,
        email: r.email,
        status: respondentStatus(r),
        submittedAt: r.submittedAt,
        answers: byRespondent(r.id),
      }))
    }
    const header = ['Nom', 'E-mail', 'Statut', 'Envoyé le', ...questions.map((q) => q.label)]
    const lines = rows.map((r) => {
      const a = byRespondent(r.id)
      return [
        r.name,
        r.email,
        STATUS_LABELS[respondentStatus(r)],
        r.submittedAt?.toISOString() ?? '',
        // Nombres bruts : un tableur les lit comme des nombres, pas comme du texte « 3 000 ».
        ...questions.map((q) =>
          q.type === 'number' ? String(a[q.id] ?? '') : formatAnswer(q, a[q.id]),
        ),
      ]
    })
    // BOM : Excel ouvre alors le fichier en UTF-8 (accents intacts).
    return `﻿${[header, ...lines].map(toCsvLine).join('\r\n')}\r\n`
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
