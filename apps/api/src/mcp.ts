import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { Db } from '@questionnaire/db'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
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

/**
 * Serveur MCP (`/mcp`, HTTP « streamable », sans état) : tout ce que fait l'admin, en outils.
 * Authentification : jeton OAuth (connecteur claude.ai) ou ADMIN_API_TOKEN (Claude Code).
 */

const INSTRUCTIONS = `Conversational questionnaires hosted on ask.tnemelc.fr. A respondent opens their personal link and answers in a chat: an AI asks the questions one by one, explains them when asked, offers one-click answers and fills a side panel; they finally click "Send my answers", which locks the answers (status "done").

Two kinds of questionnaires:
- one-shot (reusable: false): written for a single person, e.g. questions about a client's project. Create the form, then one respondent.
- reusable (reusable: true): several people answer, each with their own link (one respondent per person).

Workflow to "make a questionnaire for X": write the definition, create_form, create_respondent, then give the user the link. Never send the link or any message to the respondent yourself: the user sends it (WhatsApp, email...).

Writing good questionnaires: 5 to 12 questions, one idea each, natural order. Prefer choice / multichoice / yesno when answers are predictable (respondents click instead of typing). Add 2 to 4 "suggestions" to open questions when typical answers exist. Add "help" to any question that might not be understood: the AI uses it to explain. Put in "context" who the respondent is and what the answers are for. Write the questionnaire in the respondent's language (French by default, formal "vous"), without jargon.

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

export function buildMcpServer(db: Db, origin: string): McpServer {
  const server = new McpServer(
    { name: 'questionnaire', version: '1.0.0' },
    { instructions: INSTRUCTIONS },
  )

  server.registerTool(
    'list_forms',
    {
      title: 'List questionnaires',
      description:
        'List all questionnaires with their kind (reusable or one-shot), question count and respondent counts by status.',
      annotations: { readOnlyHint: true },
    },
    () => run(() => listFormSummaries(db)),
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
        const form = await formOrThrow(db, form_id)
        return { form, respondents: await listRespondents(db, form, origin) }
      }),
  )

  server.registerTool(
    'create_form',
    {
      title: 'Create a questionnaire',
      description:
        'Create a new questionnaire. Fails if the id is already taken (use update_form to change an existing one). Question types: text, longtext, number, date (YYYY-MM-DD), yesno, choice (one option), multichoice (several). "options" (at least 2) is required for choice/multichoice and forbidden otherwise; "suggestions" (1 to 6 one-click answers) only on questions without options; "required" defaults to true; question ids: lowercase letters, digits and underscores, unique.',
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
        ...(await putForm(db, form_id, definition, reusable, 'create')),
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
        const { id: _id, reusable: current, ...existing } = await formOrThrow(db, form_id)
        return putForm(db, form_id, definition ?? existing, reusable ?? current, 'update')
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
    ({ form_id }) => run(() => deleteForm(db, form_id)),
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
        const r = await createRespondent(db, form_id, { name, email }, origin)
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
      run(() => updateRespondent(db, respondent_id, { name, email }, origin)),
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
    ({ respondent_id }) => run(() => deleteRespondent(db, respondent_id)),
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
    ({ respondent_id }) => run(() => reopenRespondent(db, respondent_id)),
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
        const d = await getRespondentDetail(db, respondent_id, origin)
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
          answers: readableAnswers(d.form, d.answers),
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
        const form = await formOrThrow(db, form_id)
        return (await exportAnswers(db, form))
          .filter((r) => status === 'all' || r.status === status)
          .map(({ respondent: r, status: s, answers }) => ({
            respondentId: r.id,
            name: r.name,
            status: s,
            submittedAt: r.submittedAt,
            answers: readableAnswers(form, answers),
          }))
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
            'text/longtext/choice: string; number: number; date: "YYYY-MM-DD"; yesno: boolean; multichoice: string[]; null clears.',
          ),
      },
      annotations: { idempotentHint: true },
    },
    ({ respondent_id, question_id, value }) =>
      run(() => setAnswer(db, respondent_id, question_id, value)),
  )

  return server
}

export function registerMcp(
  app: FastifyInstance,
  opts: {
    db: Db
    origin: (req: FastifyRequest) => string
    authorize: (req: FastifyRequest) => boolean
  },
) {
  app.route({
    method: ['GET', 'POST', 'DELETE'],
    url: '/mcp',
    handler: async (req, reply) => {
      if (!opts.authorize(req)) {
        // Le client découvre le serveur d'autorisation par cet en-tête (RFC 9728).
        return reply
          .code(401)
          .header(
            'www-authenticate',
            `Bearer resource_metadata="${opts.origin(req)}/.well-known/oauth-protected-resource"`,
          )
          .send({ error: 'unauthorized' })
      }
      // Sans état : un serveur et un transport par requête.
      const server = buildMcpServer(opts.db, opts.origin(req))
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
