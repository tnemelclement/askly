import { timingSafeEqual } from 'node:crypto'
import { PassThrough } from 'node:stream'
import Anthropic from '@anthropic-ai/sdk'
import type { Db } from '@askly/db'
import { accounts as accountsTable, files as filesTable } from '@askly/db'
import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import { eq } from 'drizzle-orm'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import { stringify } from 'yaml'
import { z } from 'zod'
import {
  type Account,
  accountSummary,
  assertActive,
  authenticate,
  canStartResponse,
  createAccount,
  findAccountByApiToken,
  getAccount,
  OWNER_ID,
  rotateApiToken,
  sessionVersion,
  setPassword,
  verifyPassword,
} from './accounts.ts'
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
  type BillingConfig,
  createCheckout,
  createPortal,
  handleEvent,
  verifyWebhook,
} from './billing.ts'
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
import { createDraftLimiter, draftForm } from './draft.ts'
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
  /** Clé de signature des sessions et jetons OAuth : la changer déconnecte tout le monde. */
  secret: string
  /** Jeton d'API historique du propriétaire (ADMIN_API_TOKEN), en plus des jetons par compte. */
  apiToken?: string
  /** Inscription ouverte (SaaS) ; sinon seul le propriétaire se connecte. */
  signup?: boolean
  /** Abonnements Stripe ; absent, les comptes restent sur leur plan (essai, illimité…). */
  billing?: BillingConfig
  /** Adresse publique de l'app (ex. https://ask.tnemelc.fr), pour les liens renvoyés. */
  publicUrl?: string
  logger?: boolean | object
  /** Dossier du front compilé, servi sur le même domaine (production). */
  webDist?: string
  /** Stockage S3 des images et fichiers joints ; absent, ces fonctions répondent 503. */
  storage?: Storage
}

const ADMIN_COOKIE = 'admin_session'
const SESSION_TTL = 60 * 60 * 24 * 30
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
  secret,
  apiToken,
  signup = false,
  billing,
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

  const signer = createSigner(secret)
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

  /** Compte d'un jeton d'API : celui du propriétaire (ADMIN_API_TOKEN) ou un jeton de compte. */
  async function accountOfApiToken(token: string) {
    if (apiToken && safeEqual(token, apiToken)) return (await getAccount(db, OWNER_ID)) ?? null
    return (await findAccountByApiToken(db, token)) ?? null
  }

  /** Compte connecté (cookie de session ou jeton d'API), sinon 401. */
  async function requireAccount(req: FastifyRequest): Promise<Account> {
    const bearer = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1]
    if (bearer) {
      const account = await accountOfApiToken(bearer)
      if (account) return account
    }
    const session = signer.verify(req.cookies[ADMIN_COOKIE] ?? '', 'session')
    const account = typeof session?.acc === 'string' && (await getAccount(db, session.acc))
    // Un changement de mot de passe invalide les sessions ouvertes avant.
    if (!account || session?.v !== sessionVersion(account)) {
      throw new HttpError(401, 'Non connecté')
    }
    return account
  }

  function openSession(reply: FastifyReply, account: Account) {
    const value = signer.sign(
      { typ: 'session', acc: account.id, v: sessionVersion(account) },
      SESSION_TTL,
    )
    reply.setCookie(ADMIN_COOKIE, value, {
      path: '/api/admin',
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_TTL,
    })
  }

  /** Liens publics : `PUBLIC_URL`, sinon le domaine par lequel on a été appelé (trustProxy). */
  const origin = (req: FastifyRequest) => publicUrl ?? `${req.protocol}://${req.host}`

  async function respondentOrThrow(token: string): Promise<{ respondent: Respondent; form: Form }> {
    const respondent = await findRespondentByToken(db, token)
    if (!respondent) throw new HttpError(404, 'Lien invalide')
    return { respondent, form: await formOrThrow(db, respondent.accountId, respondent.formId) }
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
    // Quota du compte : compté quand une personne commence ; celles déjà lancées continuent.
    if (!respondent.startedAt) {
      const account = await getAccount(db, respondent.accountId)
      if (!account || !(await canStartResponse(db, account))) {
        throw new HttpError(
          402,
          'Ce questionnaire n’accepte plus de nouvelles réponses pour le moment. Prévenez la personne qui vous l’a envoyé.',
        )
      }
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
    const added = await addRespondentFile(db, storage, form, respondent, questionId, file)
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

  app.get('/api/config', async () => ({ signup, billing: Boolean(billing) }))

  const credentials = z.object({
    email: z.email().max(320),
    password: z.string().min(8, 'Mot de passe : 8 caractères minimum').max(200),
  })

  app.post('/api/admin/signup', async (req, reply) => {
    if (!signup) throw new HttpError(403, 'Inscription fermée sur cette instance')
    const body = credentials.extend({ acceptTerms: z.literal(true) }).parse(req.body)
    if (limiter.blocked(req.ip)) throw new HttpError(429, 'Trop de tentatives, réessayez plus tard')
    // Compté comme un échec : freine la création de comptes en série depuis une même IP.
    limiter.fail(`signup:${req.ip}`)
    if (limiter.blocked(`signup:${req.ip}`)) {
      throw new HttpError(429, 'Trop de comptes créés, réessayez plus tard')
    }
    openSession(reply, await createAccount(db, body.email, body.password))
    return { ok: true }
  })

  app.post('/api/admin/login', async (req, reply) => {
    const { email, password } = z
      .object({ email: z.string().max(320), password: z.string().max(200) })
      .parse(req.body)
    const key = email.trim().toLowerCase()
    if (limiter.blocked(key, req.ip)) {
      throw new HttpError(429, 'Trop de tentatives, réessayez plus tard')
    }
    const account = await authenticate(db, email, password)
    if (!account) {
      limiter.fail(key, req.ip)
      throw new HttpError(401, 'E-mail ou mot de passe incorrect')
    }
    openSession(reply, account)
    return { ok: true }
  })

  app.post('/api/admin/logout', async (_req, reply) => {
    reply.clearCookie(ADMIN_COOKIE, { path: '/api/admin' })
    return { ok: true }
  })

  app.get('/api/admin/me', async (req) => ({
    ...(await accountSummary(db, await requireAccount(req))),
    billing: Boolean(billing),
    mcpUrl: `${origin(req)}/mcp`,
  }))

  // Nouveau jeton d'API (affiché une seule fois) ; l'ancien cesse de marcher.
  app.post('/api/admin/api-token', async (req) => {
    const account = await requireAccount(req)
    return { token: await rotateApiToken(db, account.id) }
  })

  app.post('/api/admin/password', async (req, reply) => {
    const account = await requireAccount(req)
    const body = z
      .object({ current: z.string().max(200), password: credentials.shape.password })
      .parse(req.body)
    if (!(await verifyPassword(body.current, account.passwordHash))) {
      throw new HttpError(400, 'Mot de passe actuel incorrect')
    }
    await setPassword(db, account.id, body.password)
    openSession(reply, (await getAccount(db, account.id)) as Account)
    return { ok: true }
  })

  // Supprime le compte et tout ce qu'il contient (questionnaires, réponses, fichiers).
  app.delete('/api/admin/account', async (req, reply) => {
    const account = await requireAccount(req)
    if (account.id === OWNER_ID)
      throw new HttpError(400, 'Le compte propriétaire ne se supprime pas')
    if (account.subscriptionStatus && account.subscriptionStatus !== 'canceled') {
      throw new HttpError(400, 'Résiliez d’abord votre abonnement (Mon compte, Gérer l’abonnement)')
    }
    const { password } = z.object({ password: z.string().max(200) }).parse(req.body)
    if (!(await verifyPassword(password, account.passwordHash))) {
      throw new HttpError(400, 'Mot de passe incorrect')
    }
    const keys = (
      await db
        .select({ key: filesTable.key })
        .from(filesTable)
        .where(eq(filesTable.accountId, account.id))
    ).map((f) => f.key)
    await db.delete(accountsTable).where(eq(accountsTable.id, account.id))
    if (keys.length) await storage?.remove(keys)
    reply.clearCookie(ADMIN_COOKIE, { path: '/api/admin' })
    return { ok: true }
  })

  app.post('/api/admin/billing/checkout', async (req) => {
    const account = await requireAccount(req)
    if (!billing) throw new HttpError(503, 'Paiement non configuré sur cette instance')
    const { plan } = z.object({ plan: z.enum(['solo', 'pro']) }).parse(req.body)
    // Déjà abonné : on change d'offre par le portail (prorata géré par Stripe).
    if (
      account.stripeCustomerId &&
      account.subscriptionStatus &&
      account.subscriptionStatus !== 'canceled'
    ) {
      return { url: await createPortal(billing, account, origin(req)) }
    }
    return { url: await createCheckout(billing, account, plan, origin(req)) }
  })

  app.post('/api/admin/billing/portal', async (req) => {
    const account = await requireAccount(req)
    if (!billing) throw new HttpError(503, 'Paiement non configuré sur cette instance')
    return { url: await createPortal(billing, account, origin(req)) }
  })

  // Webhook Stripe : corps brut nécessaire pour vérifier la signature.
  app.register(async (scope) => {
    scope.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) =>
      done(null, body),
    )
    scope.post('/api/stripe/webhook', async (req, reply) => {
      if (!billing) return reply.code(404).send({ error: 'Introuvable' })
      const raw = req.body as Buffer
      if (
        !verifyWebhook(
          raw,
          req.headers['stripe-signature'] as string | undefined,
          billing.webhookSecret,
        )
      ) {
        return reply.code(400).send({ error: 'Signature invalide' })
      }
      await handleEvent(db, billing, JSON.parse(raw.toString('utf8')))
      return { received: true }
    })
  })

  const formParams = z.object({ formId: z.string() })
  const draftLimit = createDraftLimiter()

  // L'IA rédige un questionnaire (YAML à relire) à partir d'une description.
  app.post('/api/admin/forms/draft', async (req) => {
    const account = await requireAccount(req)
    assertActive(account)
    const { brief } = z.object({ brief: z.string().trim().min(10).max(4000) }).parse(req.body)
    draftLimit(account.id)
    return { source: await draftForm(anthropic, brief) }
  })

  app.get('/api/admin/forms', async (req) => {
    const account = await requireAccount(req)
    return listFormSummaries(db, account.id)
  })

  app.get('/api/admin/forms/:formId', async (req) => {
    const account = await requireAccount(req)
    const form = await formOrThrow(db, account.id, formParams.parse(req.params).formId)
    const { id: _id, reusable: _reusable, ...definition } = form
    return {
      form,
      // Texte YAML de la définition, pour l'éditeur.
      source: stringify(definition, { lineWidth: 100 }),
      respondents: await listRespondents(db, account.id, form, origin(req)),
    }
  })

  app.put('/api/admin/forms/:formId', async (req) => {
    const account = await requireAccount(req)
    const { formId } = formParams.parse(req.params)
    const body = z
      .object({
        definition: z.unknown(),
        reusable: z.boolean().optional(),
        // `create` : refuse un id déjà pris (l'éditeur, pour ne pas écraser un questionnaire).
        mode: z.enum(['create', 'upsert']).default('upsert'),
      })
      .parse(req.body)
    const saved = await putForm(db, account, formId, body.definition, body.reusable, body.mode)
    return { ...saved, adminUrl: `${origin(req)}/admin/forms/${saved.id}` }
  })

  app.delete('/api/admin/forms/:formId', async (req) => {
    const account = await requireAccount(req)
    return deleteForm(db, storage, account.id, formParams.parse(req.params).formId)
  })

  app.post('/api/admin/forms/:formId/respondents', async (req) => {
    const account = await requireAccount(req)
    const body = z
      .object({ name: z.string().trim().min(1).max(200), email: optionalEmail })
      .parse(req.body)
    return createRespondent(db, account, formParams.parse(req.params).formId, body, origin(req))
  })

  app.get('/api/admin/respondents/:id', async (req) => {
    const account = await requireAccount(req)
    const { id } = z.object({ id: z.uuid() }).parse(req.params)
    return getRespondentDetail(db, account.id, id, origin(req))
  })

  app.get('/api/admin/files/:id', async (req, reply) => {
    const account = await requireAccount(req)
    const { id } = z.object({ id: z.uuid() }).parse(req.params)
    return redirectToFile(reply, await findFile(db, id, account.id))
  })

  // Image pour un questionnaire (multipart) ; renvoie l'adresse à mettre dans `image.url`.
  app.post('/api/admin/images', async (req) => {
    const account = await requireAccount(req)
    return addImage(db, storage, account.id, await readUpload(req), origin(req))
  })

  app.get('/api/admin/forms/:formId/export', async (req, reply) => {
    const account = await requireAccount(req)
    const form = await formOrThrow(db, account.id, formParams.parse(req.params).formId)
    const { format } = z.object({ format: z.enum(['json', 'csv']) }).parse(req.query)
    const rows = await exportAnswers(db, account.id, form)
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

  registerOAuth(app, {
    origin,
    signer,
    limiter,
    authenticate: async (email, password) => (await authenticate(db, email, password))?.id ?? null,
  })
  registerMcp(app, {
    db,
    storage,
    origin,
    authorize: async (req) => {
      const bearer = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1]
      if (!bearer) return null
      const oauthAccount = verifyAccessToken(signer, bearer, OWNER_ID)
      if (oauthAccount) return (await getAccount(db, oauthAccount)) ?? null
      return accountOfApiToken(bearer)
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
