import type { Db } from '@askly/db'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { type Account, assertFeature } from './accounts.ts'
import {
  createRespondent,
  deleteForm,
  deleteRespondent,
  exportAnswers,
  formOrThrow,
  getRespondentDetail,
  HttpError,
  listFormSummaries,
  listRespondents,
  putForm,
  readableAnswers,
  reopenRespondent,
  setAnswer,
  updateRespondent,
} from './admin.ts'
import { formSchema, missingRequired } from './domain.ts'
import {
  addImage,
  type FileInfo,
  type FileRow,
  fetchImage,
  findFile,
  requireStorage,
  type Upload,
} from './files.ts'
import { IMAGE_TYPES, type Storage } from './storage.ts'

/**
 * Serveur MCP (`/mcp`, HTTP « streamable », sans état) : tout ce que fait l'admin, en outils.
 * Authentification : jeton OAuth (connecteur claude.ai) ou ADMIN_API_TOKEN (Claude Code).
 */

export const INSTRUCTIONS = `Askly: conversational questionnaires hosted on ask.tnemelc.fr. A respondent opens their personal link and answers in a chat: an AI asks the questions one by one, explains them when asked, offers one-click answers and fills a side panel; they finally click "Send my answers", which locks the answers (status "done").

Two kinds of questionnaires:
- one-shot (reusable: false): written for a single person, e.g. questions about a client's project. Create the form, then one respondent.
- reusable (reusable: true): several people answer, each with their own link (one respondent per person).

Workflow to "make a questionnaire for X": write the definition, create_form, create_respondent, then give the user the link. Never send the link or any message to the respondent yourself: the user sends it (WhatsApp, email...).

Tutorials (kind: "tutorial"): to get someone to do something without calling them. Each step is a question of type "step": label = the action in one sentence, help = where to click, what they should see, common pitfalls (the AI uses it when they are stuck), image = a screenshot. The AI gives one step at a time and marks it done when the person says so.

Writing good questionnaires: 5 to 12 questions, one idea each, natural order. Prefer choice / multichoice / yesno when answers are predictable (respondents click instead of typing). Add 2 to 4 "suggestions" to open questions when typical answers exist. Add "help" to any question that might not be understood: the AI uses it to explain. Put in "context" who the respondent is and what the answers are for. Write the questionnaire in the respondent's language (French by default, formal "vous"), without jargon.

Images: a question (or the whole form) can show an image, "image": { "url": "...", "alt": "..." }. Upload it first with upload_image (from a URL or base64) and use the returned url.
Files: a question of type "file" lets the respondent attach photos, PDFs or documents (20 MB each, 10 per question). Answers list the files; use get_file to download one or look at an image.

When a questionnaire already has answers, keep question ids stable: an answer is attached to its question id and disappears if the id changes.`

const formId = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{1,62}$/)
  .describe(
    'Questionnaire id: lowercase letters, digits and dashes, e.g. "kitchen-project-dupont".',
  )
const respondentId = z.uuid().describe('Respondent id (from create_respondent or get_form).')

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }

/** Résultat JSON ; une erreur métier (HttpError) devient un résultat d'erreur lisible. */
async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return { content: [{ type: 'text', text: JSON.stringify(await fn(), null, 2) }] }
  } catch (err) {
    if (err instanceof HttpError)
      return { content: [{ type: 'text', text: err.message }], isError: true }
    throw err
  }
}

export function buildMcpServer(
  db: Db,
  account: Account,
  origin: string,
  storage?: Storage,
): McpServer {
  /** Fichiers joints avec un lien de téléchargement signé (1 h), utilisable sans connexion. */
  const fileLinks = (rows: FileRow[] | FileInfo[]) =>
    Promise.all(
      rows.map(async (f) => {
        const row = 'key' in f ? f : null
        return {
          fileId: f.id,
          ...('questionId' in f && { questionId: f.questionId }),
          filename: f.filename,
          contentType: f.contentType,
          size: f.size,
          downloadUrl:
            storage && row
              ? await storage.signedUrl(row.key, f.filename)
              : `${origin}/api/admin/files/${f.id}`,
        }
      }),
    )

  const server = new McpServer({ name: 'askly', version: '1.0.0' }, { instructions: INSTRUCTIONS })

  server.registerTool(
    'list_forms',
    {
      title: 'List questionnaires',
      description:
        'List all questionnaires with their kind (reusable or one-shot), question count and respondent counts by status.',
      annotations: { readOnlyHint: true },
    },
    () => run(() => listFormSummaries(db, account.id)),
  )

  server.registerTool(
    'get_form',
    {
      title: 'Get a questionnaire',
      description:
        'Get a questionnaire: its full definition (sections and questions) and its respondents with status, answered count and personal link.',
      inputSchema: { form_id: formId },
      annotations: { readOnlyHint: true },
    },
    ({ form_id }) =>
      run(async () => {
        const form = await formOrThrow(db, account.id, form_id)
        return { form, respondents: await listRespondents(db, account.id, form, origin) }
      }),
  )

  server.registerTool(
    'create_form',
    {
      title: 'Create a questionnaire',
      description:
        'Create a new questionnaire. Fails if the id is already taken (use update_form to change an existing one). Question types: text, longtext, number, date (YYYY-MM-DD), yesno, choice (one option), multichoice (several), file (the respondent attaches photos/PDF/documents with a button; up to 10 files of 20 MB), step (tutorials only: something the person does; answered true when they say it is done). Set "kind": "tutorial" to guide someone through steps instead of asking questions. Optional "image": { "url", "alt" } on a question or on the form (cover), url from upload_image. "options" (at least 2) is required for choice/multichoice and forbidden otherwise; "suggestions" (1 to 6 one-click answers) only on questions without options; "required" defaults to true; question ids: lowercase letters, digits and underscores, unique.',
      inputSchema: {
        form_id: formId,
        reusable: z
          .boolean()
          .describe(
            'true: several people answer, one link each. false: one-shot, for a single person.',
          ),
        definition: formSchema,
      },
    },
    ({ form_id, reusable, definition }) =>
      run(async () => ({
        ...(await putForm(db, account, form_id, definition, reusable, 'create')),
        adminUrl: `${origin}/admin/forms/${form_id}`,
      })),
  )

  server.registerTool(
    'update_form',
    {
      title: 'Update a questionnaire',
      description:
        'Replace the definition of an existing questionnaire and/or change its kind. Existing links stay valid. Keep question ids stable when respondents already answered.',
      inputSchema: {
        form_id: formId,
        definition: formSchema
          .optional()
          .describe('New full definition (omit to keep the current one).'),
        reusable: z.boolean().optional(),
      },
      annotations: { idempotentHint: true },
    },
    ({ form_id, definition, reusable }) =>
      run(async () => {
        const {
          id: _id,
          reusable: current,
          ...existing
        } = await formOrThrow(db, account.id, form_id)
        return putForm(db, account, form_id, definition ?? existing, reusable ?? current, 'update')
      }),
  )

  server.registerTool(
    'delete_form',
    {
      title: 'Delete a questionnaire',
      description:
        'Permanently delete a questionnaire with all its respondents, their answers and conversations. Irreversible: only on explicit user request.',
      inputSchema: { form_id: formId },
      annotations: { destructiveHint: true },
    },
    ({ form_id }) => run(() => deleteForm(db, storage, account.id, form_id)),
  )

  server.registerTool(
    'create_respondent',
    {
      title: 'Create a respondent link',
      description:
        "Create a respondent for a questionnaire and return their personal link (/r/<token>), to give to the user who sends it. One respondent per person. The link is the respondent's only secret: share it only with them.",
      inputSchema: {
        form_id: formId,
        name: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .describe('Respondent name, shown to them in the chat.'),
        email: z
          .email()
          .max(320)
          .optional()
          .describe('Optional; the link can be sent by WhatsApp.'),
      },
    },
    ({ form_id, name, email }) =>
      run(async () => {
        const r = await createRespondent(db, account, form_id, { name, email }, origin)
        return { respondentId: r.id, name: r.name, email: r.email, status: r.status, link: r.link }
      }),
  )

  server.registerTool(
    'update_respondent',
    {
      title: 'Update a respondent',
      description: 'Change the name or email of a respondent (email: null removes it).',
      inputSchema: {
        respondent_id: respondentId,
        name: z.string().trim().min(1).max(200).optional(),
        email: z.email().max(320).nullable().optional(),
      },
      annotations: { idempotentHint: true },
    },
    ({ respondent_id, name, email }) =>
      run(() => updateRespondent(db, account.id, respondent_id, { name, email }, origin)),
  )

  server.registerTool(
    'delete_respondent',
    {
      title: 'Delete a respondent',
      description:
        'Permanently delete a respondent, their answers and conversation; their link stops working. Irreversible: only on explicit user request.',
      inputSchema: { respondent_id: respondentId },
      annotations: { destructiveHint: true },
    },
    ({ respondent_id }) => run(() => deleteRespondent(db, storage, account.id, respondent_id)),
  )

  server.registerTool(
    'reopen_respondent',
    {
      title: 'Reopen answers',
      description:
        'Unlock answers a respondent already sent, so they can chat and correct them again with the same link.',
      inputSchema: { respondent_id: respondentId },
      annotations: { idempotentHint: true },
    },
    ({ respondent_id }) => run(() => reopenRespondent(db, account.id, respondent_id)),
  )

  server.registerTool(
    'get_respondent',
    {
      title: 'Get a respondent',
      description:
        'Get one respondent: status (not_started, in_progress, done), link, answers question by question (raw value and readable display), missing required questions, and optionally the chat transcript.',
      inputSchema: {
        respondent_id: respondentId,
        include_conversation: z.boolean().default(false),
      },
      annotations: { readOnlyHint: true },
    },
    ({ respondent_id, include_conversation }) =>
      run(async () => {
        const d = await getRespondentDetail(db, account.id, respondent_id, origin)
        return {
          respondent: {
            id: d.respondent.id,
            name: d.respondent.name,
            email: d.respondent.email,
            status: d.respondent.status,
            link: d.respondent.link,
            startedAt: d.respondent.startedAt,
            submittedAt: d.respondent.submittedAt,
          },
          form: { id: d.form.id, title: d.form.title },
          answers: readableAnswers(d.form, d.answers, d.files),
          files: await fileLinks(Object.values(d.files)),
          missingRequired: missingRequired(d.form, d.answers).map((q) => q.id),
          ...(include_conversation && { conversation: d.messages }),
        }
      }),
  )

  server.registerTool(
    'get_answers',
    {
      title: 'Get all answers',
      description:
        'Get the answers of every respondent of a questionnaire, question by question. Answers are final only when status is "done".',
      inputSchema: {
        form_id: formId,
        status: z.enum(['all', 'done', 'in_progress', 'not_started']).default('all'),
      },
      annotations: { readOnlyHint: true },
    },
    ({ form_id, status }) =>
      run(async () => {
        const form = await formOrThrow(db, account.id, form_id)
        return Promise.all(
          (await exportAnswers(db, account.id, form))
            .filter((r) => status === 'all' || r.status === status)
            .map(async ({ respondent: r, status: s, answers, files }) => ({
              respondentId: r.id,
              name: r.name,
              status: s,
              submittedAt: r.submittedAt,
              answers: readableAnswers(form, answers, files),
              files: await fileLinks(Object.values(files).filter((f) => f.respondentId === r.id)),
            })),
        )
      }),
  )

  server.registerTool(
    'set_answer',
    {
      title: 'Set or clear an answer',
      description:
        "Set a respondent's answer on their behalf (validated against the question type, as in the chat), or clear it with value null.",
      inputSchema: {
        respondent_id: respondentId,
        question_id: z.string().max(100),
        value: z
          .union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()])
          .describe(
            'text/longtext/choice: string; number: number; date: "YYYY-MM-DD"; yesno: boolean; step: true; multichoice: string[]; null clears.',
          ),
      },
      annotations: { idempotentHint: true },
    },
    ({ respondent_id, question_id, value }) =>
      run(() => setAnswer(db, storage, account.id, respondent_id, question_id, value)),
  )

  server.registerTool(
    'upload_image',
    {
      title: 'Upload an image',
      description:
        'Store an image (JPEG, PNG, WebP or GIF, 20 MB max) to illustrate a questionnaire, from a public https URL or from base64 content. Returns the url to put in a question\'s (or the form\'s) "image": { "url", "alt" }.',
      inputSchema: {
        source_url: z.url().optional().describe('Public https URL of the image to copy.'),
        content_base64: z.string().optional().describe('Image content, base64-encoded.'),
        filename: z
          .string()
          .max(200)
          .optional()
          .describe('File name, e.g. "terrasse.jpg" (needed with content_base64).'),
        content_type: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']).optional(),
      },
    },
    ({ source_url, content_base64, filename, content_type }) =>
      run(async () => {
        let upload: Upload
        if (source_url) {
          upload = await fetchImage(source_url)
        } else if (content_base64) {
          upload = {
            filename: filename ?? 'image',
            contentType: content_type ?? guessImageType(filename ?? ''),
            body: Buffer.from(content_base64, 'base64'),
          }
        } else {
          throw new HttpError(400, 'source_url ou content_base64 requis')
        }
        if (filename) upload.filename = filename
        const image = await addImage(db, storage, account.id, upload, origin)
        return { url: image.url, filename: image.filename, size: image.size }
      }),
  )

  server.registerTool(
    'get_file',
    {
      title: 'Get a file',
      description:
        'Get a file a respondent attached (or a questionnaire image): its metadata and a signed download URL valid 1 hour. Images up to 5 MB are also returned as image content so you can look at them; small text/CSV files as text.',
      inputSchema: { file_id: z.uuid() },
      annotations: { readOnlyHint: true },
    },
    async ({ file_id }) => {
      try {
        const s3 = requireStorage(storage)
        const file = await findFile(db, file_id, account.id)
        const meta = {
          fileId: file.id,
          filename: file.filename,
          contentType: file.contentType,
          size: file.size,
          downloadUrl: await s3.signedUrl(file.key, file.filename),
        }
        const content: (
          | { type: 'text'; text: string }
          | { type: 'image'; data: string; mimeType: string }
        )[] = [{ type: 'text', text: JSON.stringify(meta, null, 2) }]
        if (IMAGE_TYPES.has(file.contentType) && file.size <= 5 * 1024 * 1024) {
          content.push({
            type: 'image',
            data: (await s3.read(file.key)).toString('base64'),
            mimeType: file.contentType,
          })
        } else if (/^text\/(plain|csv)$/.test(file.contentType) && file.size <= 200_000) {
          content.push({ type: 'text', text: (await s3.read(file.key)).toString('utf8') })
        }
        return { content }
      } catch (err) {
        if (err instanceof HttpError)
          return { content: [{ type: 'text' as const, text: err.message }], isError: true }
        throw err
      }
    },
  )

  return server
}

function guessImageType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop()
  return ext === 'png'
    ? 'image/png'
    : ext === 'webp'
      ? 'image/webp'
      : ext === 'gif'
        ? 'image/gif'
        : 'image/jpeg'
}

export function registerMcp(
  app: FastifyInstance,
  opts: {
    db: Db
    storage?: Storage | undefined
    origin: (req: FastifyRequest) => string
    /** Compte du jeton présenté, ou `null`. */
    authorize: (req: FastifyRequest) => Promise<Account | null>
  },
) {
  app.route({
    method: ['GET', 'POST', 'DELETE'],
    url: '/mcp',
    handler: async (req, reply) => {
      const account = await opts.authorize(req)
      if (!account) {
        // Le client découvre le serveur d'autorisation par cet en-tête (RFC 9728).
        return reply
          .code(401)
          .header(
            'www-authenticate',
            `Bearer resource_metadata="${opts.origin(req)}/.well-known/oauth-protected-resource"`,
          )
          .send({ error: 'unauthorized' })
      }
      try {
        assertFeature(account, 'mcp')
      } catch (err) {
        return reply.code(403).send({ error: (err as Error).message })
      }
      // Sans état : un serveur et un transport par requête.
      const server = buildMcpServer(opts.db, account, opts.origin(req), opts.storage)
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      })
      reply.hijack()
      reply.raw.on('close', () => {
        void transport.close()
        void server.close()
      })
      await server.connect(transport)
      await transport.handleRequest(req.raw, reply.raw, req.body)
    },
  })
}
