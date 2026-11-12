import { z } from 'zod'

/**
 * Domaine pur (sans Node) : format d'un questionnaire, validation des réponses, mise en
 * forme. Partagé avec le front (`@askly/api/domain`).
 */

export const QUESTION_TYPES = [
  'text',
  'longtext',
  'choice',
  'multichoice',
  'number',
  'date',
  'yesno',
  'file',
] as const

/** Fichiers joints au plus par question `file`, et taille maximale de chacun. */
export const MAX_FILES_PER_QUESTION = 10
export const MAX_FILE_SIZE = 20 * 1024 * 1024

/** Image affichée au répondant (adresse renvoyée par `upload_image`, ou toute image en ligne). */
const imageSchema = z.strictObject({
  url: z.url({ protocol: /^https?$/ }),
  alt: z.string().max(300).optional().describe('Description, pour les lecteurs d’écran et l’IA.'),
})
export type QuestionType = (typeof QUESTION_TYPES)[number]

const questionSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9_]+$/, 'id en minuscules, chiffres et _'),
    label: z.string().min(1),
    help: z.string().optional(),
    type: z.enum(QUESTION_TYPES),
    options: z.array(z.string().min(1)).min(2).optional(),
    /** Réponses proposées en un clic pour une question ouverte (le répondant peut aussi écrire). */
    suggestions: z.array(z.string().min(1).max(200)).min(1).max(6).optional(),
    /** Illustration montrée avec la question. */
    image: imageSchema.optional(),
    required: z.boolean().default(true),
  })
  .refine((q) => (q.type === 'choice' || q.type === 'multichoice') === Boolean(q.options), {
    message: '`options` est requis pour choice/multichoice, et interdit pour les autres types',
  })
  .refine((q) => !(q.suggestions && (q.options || q.type === 'file')), {
    message: '`suggestions` est réservé aux questions sans `options` (ni `file`)',
  })

/** Identifiant d'un questionnaire : il apparaît dans les URL de l'admin. */
export const FORM_ID = /^[a-z0-9][a-z0-9-]{1,62}$/

export const formSchema = z
  .strictObject({
    title: z.string().min(1),
    intro: z.string().min(1),
    context: z.string().optional(),
    /** Présentation : conversation avec l'IA (défaut) ou formulaire classique, une question par écran. */
    style: z
      .enum(['chat', 'classic'])
      .optional()
      .describe(
        'chat (default): the AI asks the questions; classic: one question per screen, no AI.',
      ),
    /** Image de couverture, au-dessus de l'introduction. */
    image: imageSchema.optional(),
    sections: z
      .array(
        z.strictObject({ title: z.string().min(1), questions: z.array(questionSchema).min(1) }),
      )
      .min(1),
  })
  .superRefine((form, ctx) => {
    const seen = new Set<string>()
    for (const q of form.sections.flatMap((s) => s.questions)) {
      if (seen.has(q.id)) ctx.addIssue({ code: 'custom', message: `id en double : ${q.id}` })
      seen.add(q.id)
    }
  })

export type FormDefinition = z.infer<typeof formSchema>
export type Question = FormDefinition['sections'][number]['questions'][number]
export type Form = FormDefinition & { id: string }

export type AnswerValue = string | number | boolean | string[]
export type Answers = Record<string, AnswerValue>

/** Événements du flux NDJSON de `POST /api/r/:token/chat`, un par ligne. */
export type ChatEvent =
  | { type: 'message_start' }
  | { type: 'text'; text: string }
  | { type: 'answer'; questionId: string; value: AnswerValue }
  | { type: 'question'; questionId: string; suggestions: string[] }
  | { type: 'error'; message: string }
  | { type: 'done' }

export function allQuestions(form: FormDefinition): Question[] {
  return form.sections.flatMap((s) => s.questions)
}

type Result = { ok: true; value: AnswerValue } | { ok: false; error: string }

const MAX_LENGTH = { text: 500, longtext: 5000 } as const

function validateValue(q: Question, raw: unknown): Result {
  const fail = (error: string): Result => ({ ok: false, error })
  switch (q.type) {
    case 'text':
    case 'longtext': {
      if (typeof raw !== 'string' || !raw.trim()) return fail('texte non vide attendu')
      if (raw.length > MAX_LENGTH[q.type]) return fail(`${MAX_LENGTH[q.type]} caractères maximum`)
      return { ok: true, value: raw.trim() }
    }
    case 'number': {
      const n =
        typeof raw === 'number'
          ? raw
          : typeof raw === 'string' && raw.trim()
            ? Number(raw.replace(/\s/g, '').replace(',', '.'))
            : Number.NaN
      return Number.isFinite(n) ? { ok: true, value: n } : fail('nombre attendu')
    }
    case 'date': {
      if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        return fail('date au format AAAA-MM-JJ attendue')
      }
      // `2025-02-30` passe la regex mais Date le décale au 2 mars : on le refuse.
      const d = new Date(`${raw}T00:00:00Z`)
      return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(raw)
        ? { ok: true, value: raw }
        : fail('date inexistante')
    }
    case 'yesno':
      return typeof raw === 'boolean' ? { ok: true, value: raw } : fail('true ou false attendu')
    case 'choice':
      return typeof raw === 'string' && q.options?.includes(raw)
        ? { ok: true, value: raw }
        : fail(`une option parmi : ${q.options?.join(' | ')}`)
    case 'multichoice': {
      if (!Array.isArray(raw) || raw.length === 0) return fail("liste d'options non vide attendue")
      const unknown = raw.filter((v) => typeof v !== 'string' || !q.options?.includes(v))
      if (unknown.length) {
        return fail(
          `options inconnues : ${unknown.join(', ')} (valides : ${q.options?.join(' | ')})`,
        )
      }
      // Ordre du questionnaire, sans doublon.
      return { ok: true, value: (q.options ?? []).filter((o) => raw.includes(o)) }
    }
    case 'file': {
      // Les id des fichiers joints ; le serveur vérifie qu'ils appartiennent au répondant.
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (!Array.isArray(raw) || raw.length === 0)
        return fail('liste de fichiers non vide attendue')
      if (!raw.every((v) => typeof v === 'string' && uuid.test(v)))
        return fail('id de fichier attendus')
      const ids = [...new Set(raw as string[])]
      return ids.length > MAX_FILES_PER_QUESTION
        ? fail(`${MAX_FILES_PER_QUESTION} fichiers maximum`)
        : { ok: true, value: ids }
    }
  }
}

/** Valide une réponse (outil de l'IA ou correction manuelle) ; refuse les ids inconnus. */
export function validateAnswer(
  form: FormDefinition,
  questionId: string,
  raw: unknown,
): { ok: true; question: Question; value: AnswerValue } | { ok: false; error: string } {
  const question = allQuestions(form).find((q) => q.id === questionId)
  if (!question) return { ok: false, error: `question inconnue : ${questionId}` }
  const result = validateValue(question, raw)
  return result.ok
    ? { ok: true, question, value: result.value }
    : { ok: false, error: `${questionId} : ${result.error}` }
}

/** Valeur lisible (panneau, export CSV, retour à l'IA). */
export function formatAnswer(
  q: Question,
  value: AnswerValue | undefined,
  /** Noms des fichiers joints, par id (questions `file`). */
  fileNames: Record<string, string> = {},
): string {
  if (value === undefined) return ''
  if (q.type === 'file' && Array.isArray(value)) {
    return value.map((id) => fileNames[id] ?? 'fichier').join(', ')
  }
  if (q.type === 'yesno') return value ? 'Oui' : 'Non'
  if (q.type === 'date' && typeof value === 'string') {
    return new Date(`${value}T00:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC' })
  }
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'number') return value.toLocaleString('fr-FR')
  return String(value)
}

export function missingRequired(form: FormDefinition, answers: Answers): Question[] {
  return allQuestions(form).filter((q) => q.required && answers[q.id] === undefined)
}

export type RespondentStatus = 'not_started' | 'in_progress' | 'done'

export const STATUS_LABELS: Record<RespondentStatus, string> = {
  not_started: 'Pas commencé',
  in_progress: 'En cours',
  done: 'Terminé',
}

export function respondentStatus(r: {
  startedAt: Date | string | null
  submittedAt: Date | string | null
}): RespondentStatus {
  if (r.submittedAt) return 'done'
  return r.startedAt ? 'in_progress' : 'not_started'
}
