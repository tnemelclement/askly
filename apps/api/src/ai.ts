import type Anthropic from '@anthropic-ai/sdk'
import type { Db } from '@askly/db'
import { z } from 'zod'
import {
  type Answers,
  allQuestions,
  type ChatEvent,
  type Form,
  formatAnswer,
  missingRequired,
  type Question,
  validateAnswer,
} from './domain.ts'
import { fileInfos } from './files.ts'
import {
  appendMessages,
  loadAnswers,
  loadMessages,
  markStarted,
  type NewMessage,
  type Respondent,
  saveAnswer,
} from './store.ts'

/**
 * L'assistant du répondant : pose les questions une à une, explique quand on lui demande,
 * et enregistre chaque réponse par l'outil `record_answer`. Sa sortie n'est jamais digne de
 * confiance : chaque appel est revalidé contre le type de la question (`validateAnswer`),
 * une valeur refusée lui revient en erreur pour qu'il reformule.
 */

export const AI_MODEL = 'claude-haiku-5-5'
export const RECORD_ANSWER_TOOL = 'record_answer'
export const PRESENT_QUESTION_TOOL = 'present_question'
/** Garde-fou contre une boucle d'outils sans fin dans un même tour. */
const MAX_STEPS = 6

const TYPE_HINTS: Record<Question['type'], string> = {
  text: 'texte court (chaîne)',
  longtext: 'texte libre (chaîne), reformulé fidèlement si besoin',
  choice: 'UNE option, recopiée exactement (chaîne)',
  multichoice: 'liste des options choisies, recopiées exactement (tableau de chaînes)',
  number: 'nombre JSON (ex. 1500), sans unité',
  date: 'chaîne AAAA-MM-JJ',
  yesno: 'booléen JSON true ou false',
  file: `fichier(s) que le répondant joint lui-même avec le bouton « Joindre un fichier » sous la question (photos, PDF, documents) ; ne jamais utiliser ${RECORD_ANSWER_TOOL} pour ce type`,
}

function describeQuestion(q: Question): string {
  const lines = [`- ${q.id} — ${q.label}${q.required ? '' : ' (facultative)'}`]
  lines.push(`  type : ${TYPE_HINTS[q.type]}`)
  if (q.options) lines.push(`  options : ${q.options.map((o) => `"${o}"`).join(', ')}`)
  if (q.help) lines.push(`  aide : ${q.help.trim()}`)
  if (q.image) {
    lines.push(
      `  image : affichée au répondant avec la question${q.image.alt ? ` (${q.image.alt})` : ''}`,
    )
  }
  return lines.join('\n')
}

/** Stable pour un questionnaire donné (rien de variable) : le préfixe reste en cache. */
export function buildSystemPrompt(form: Form): string {
  const sections = form.sections
    .map((s) => `## ${s.title}\n${s.questions.map(describeQuestion).join('\n')}`)
    .join('\n\n')
  return `Vous aidez une personne à remplir le questionnaire « ${form.title} » sous forme de conversation.

Présentation donnée au répondant : ${form.intro.trim()}
${form.context ? `\nContexte (pour vous, ne pas le réciter) : ${form.context.trim()}\n` : ''}
Règles :
- Vouvoyez, en français, sur un ton chaleureux et professionnel. Messages courts : une ou deux phrases, puis la question.
- Posez UNE question à la fois, dans l'ordre du questionnaire, en sautant celles déjà remplies (voir l'état fourni avec chaque message).
- À la fin de CHAQUE message qui pose (ou repose) une question du questionnaire, y compris juste après un ${RECORD_ANSWER_TOOL}, appelez l'outil ${PRESENT_QUESTION_TOOL} : il affiche sous votre message des réponses en un clic. Pour une question à choix ou oui/non, les boutons reprennent les options : inutile de les énumérer dans le texte, sauf pour les expliquer. Pour une question ouverte, proposez si possible 2 à 4 réponses courtes et plausibles, adaptées à ce que vous savez déjà du répondant ; le répondant peut toujours écrire autre chose.
- Chaque message que vous écrivez contient du texte : ne vous contentez jamais d'appeler les outils.
- Ne demandez jamais un format technique (AAAA-MM-JJ, nombre sans unité…) : la personne répond comme elle veut, vous convertissez. Les réponses proposées sont écrites comme la personne les dirait (« mars 2019 », pas « 2019-03-01 »). N'en proposez pas pour ce que vous ne pouvez pas deviner (prénom, âge, date personnelle, coordonnées).
- Si la personne ne comprend pas ou demande des précisions, expliquez simplement, avec un exemple concret, puis aidez-la à formuler sa réponse. Appuyez-vous sur l'« aide » de la question.
- Dès qu'une réponse est claire, enregistrez-la avec l'outil ${RECORD_ANSWER_TOOL}, puis enchaînez. Une réponse peut en couvrir plusieurs : enregistrez chacune.
- Si la réponse est ambiguë ou incomplète, demandez une précision au lieu de deviner. N'inventez jamais une réponse.
- Si la personne corrige une réponse précédente, réenregistrez-la.
- Une question facultative peut être passée si la personne ne souhaite pas répondre.
- Pour une question de type fichier, invitez la personne à utiliser le bouton « Joindre un fichier » ; quand elle a joint ses fichiers, son message l'indique (les noms apparaissent dans l'état), enchaînez.
- Si l'outil renvoie une erreur, corrigez la valeur ou reposez la question.
- Restez sur le sujet du questionnaire ; déclinez poliment le reste.
- Pas de Markdown (ni gras, ni titres) ; des tirets simples pour une liste.
- Quand toutes les questions obligatoires sont remplies, faites un court récapitulatif et invitez la personne à vérifier le panneau « Vos réponses » (elle peut y corriger chaque ligne) puis à cliquer sur « Envoyer mes réponses ».

Questions :

${sections}`
}

export function buildRecordAnswerTool(form: Form): Anthropic.Tool {
  return {
    name: RECORD_ANSWER_TOOL,
    description:
      'Enregistre la réponse du répondant à une question du questionnaire. La valeur doit respecter le type de la question ; elle est vérifiée et une erreur est renvoyée si elle est invalide.',
    input_schema: {
      type: 'object',
      properties: {
        question_id: {
          type: 'string',
          enum: allQuestions(form).map((q) => q.id),
          description: 'Identifiant de la question.',
        },
        value: {
          description:
            'La réponse, au format du type de la question : chaîne, nombre, booléen, ou tableau de chaînes (multichoice).',
          anyOf: [
            { type: 'string' },
            { type: 'number' },
            { type: 'boolean' },
            { type: 'array', items: { type: 'string' } },
          ],
        },
      },
      required: ['question_id', 'value'],
      additionalProperties: false,
    },
  }
}

export function buildPresentQuestionTool(form: Form): Anthropic.Tool {
  return {
    name: PRESENT_QUESTION_TOOL,
    description:
      "Affiche, sous votre message, la question posée avec des réponses cliquables. Les options d'une question à choix ou oui/non s'affichent d'office ; `suggestions` sert aux questions ouvertes.",
    input_schema: {
      type: 'object',
      properties: {
        question_id: {
          type: 'string',
          enum: allQuestions(form).map((q) => q.id),
          description: 'La question que vous venez de poser.',
        },
        suggestions: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 4,
          description:
            'Pour une question ouverte : 2 à 4 réponses courtes et plausibles (60 caractères max chacune). Omettez pour une question à choix.',
        },
      },
      required: ['question_id'],
      additionalProperties: false,
    },
  }
}

/**
 * Réponses proposées pour une question : celles du questionnaire d'abord, puis celles de
 * l'IA (filtrées : chaînes courtes, sans doublon). Les questions à options n'en ont pas,
 * l'interface affiche leurs options.
 */
export function mergeSuggestions(q: Question, fromAi: unknown): string[] {
  if (q.options || q.type === 'yesno') return []
  const ai = Array.isArray(fromAi)
    ? fromAi.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    : []
  const all = [...(q.suggestions ?? []), ...ai.map((v) => v.trim().slice(0, 120))]
  return [...new Set(all)].slice(0, 6)
}

/** État joint à chaque message du répondant : ce qui est rempli, ce qui manque. */
export function describeState(
  form: Form,
  answers: Answers,
  fileNames: Record<string, string> = {},
): string {
  const lines = allQuestions(form).map((q) =>
    answers[q.id] === undefined
      ? `- ${q.id} : (vide)${q.required ? '' : ' facultative'}`
      : `- ${q.id} : ${formatAnswer(q, answers[q.id], fileNames)}`,
  )
  const missing = missingRequired(form, answers).length
  return `<etat_du_questionnaire>\n${lines.join('\n')}\n${missing === 0 ? 'Toutes les questions obligatoires sont remplies.' : `${missing} question(s) obligatoire(s) restante(s).`}\n</etat_du_questionnaire>`
}

const toolInputSchema = z.object({ question_id: z.string(), value: z.unknown() })
const presentInputSchema = z.object({ question_id: z.string(), suggestions: z.unknown() })

/** Applique un appel d'outil (validation, enregistrement ou affichage) ; renvoie le résultat pour le modèle. */
export async function applyToolCall(
  db: Db,
  form: Form,
  respondentId: string,
  block: Anthropic.ToolUseBlock,
  emit: (e: ChatEvent) => void,
): Promise<Anthropic.ToolResultBlockParam> {
  const fail = (content: string): Anthropic.ToolResultBlockParam => ({
    type: 'tool_result',
    tool_use_id: block.id,
    is_error: true,
    content,
  })
  if (block.name === PRESENT_QUESTION_TOOL) {
    const input = presentInputSchema.safeParse(block.input)
    const question = input.success
      ? allQuestions(form).find((q) => q.id === input.data.question_id)
      : undefined
    if (!input.success || !question) return fail('question_id inconnu')
    emit({
      type: 'question',
      questionId: question.id,
      suggestions: mergeSuggestions(question, input.data.suggestions),
    })
    return { type: 'tool_result', tool_use_id: block.id, content: 'Affiché.' }
  }
  if (block.name !== RECORD_ANSWER_TOOL) return fail(`outil inconnu : ${block.name}`)
  const input = toolInputSchema.safeParse(block.input)
  if (!input.success) return fail('entrée invalide : { question_id, value } attendu')
  const result = validateAnswer(form, input.data.question_id, input.data.value)
  if (!result.ok) return fail(result.error)
  if (result.question.type === 'file') {
    return fail('les fichiers se joignent par le bouton « Joindre un fichier », pas par cet outil')
  }
  await saveAnswer(db, respondentId, result.question.id, result.value, 'ai')
  emit({ type: 'answer', questionId: result.question.id, value: result.value })
  return {
    type: 'tool_result',
    tool_use_id: block.id,
    content: `Enregistré : ${result.question.label} = ${formatAnswer(result.question, result.value)}`,
  }
}

const KICKOFF =
  "(Le répondant vient d'ouvrir le questionnaire. Accueillez-le en une phrase, rappelez qu'il peut demander des précisions à tout moment, puis posez la première question.)"

/**
 * Un tour de conversation : enregistre le message du répondant (ou l'ouverture), puis
 * appelle le modèle en flux jusqu'à ce qu'il rende la main, en exécutant ses appels
 * d'outils. Tout est ajouté à l'historique tel que renvoyé par l'API (blocs de thinking
 * compris) : on ne réécrit jamais un tour passé.
 */
export async function runTurn(opts: {
  db: Db
  client: Anthropic
  form: Form
  respondent: Respondent
  message: string | null
  emit: (e: ChatEvent) => void
}): Promise<void> {
  const { db, client, form, respondent, message, emit } = opts
  await markStarted(db, respondent.id)

  const names = Object.fromEntries(
    Object.values(await fileInfos(db, respondent.id)).map((f) => [f.id, f.filename]),
  )
  const state = describeState(form, await loadAnswers(db, respondent.id), names)
  await appendMessages(db, respondent.id, [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `${state}\n\n${message ? `Message du répondant : ${message}` : KICKOFF}`,
        },
      ],
      display: message,
    },
  ])

  const system = buildSystemPrompt(form)
  const tools = [buildRecordAnswerTool(form), buildPresentQuestionTool(form)]

  let presented = null as string | null
  let spoke = false
  const track = (e: ChatEvent) => {
    if (e.type === 'question') presented = e.questionId
    emit(e)
  }

  for (let step = 0; step < MAX_STEPS; step++) {
    const history = (await loadMessages(db, respondent.id)).map(
      (m) => ({ role: m.role, content: m.content }) as Anthropic.MessageParam,
    )
    emit({ type: 'message_start' })
    const stream = client.messages.stream(
      {
        model: AI_MODEL,
        max_tokens: 16000,
        system,
        tools,
        messages: history,
        // Conversation simple : effort bas pour des réponses rapides.
        output_config: { effort: 'low' },
        cache_control: { type: 'ephemeral' },
      },
      { timeout: 60_000, maxRetries: 1 },
    )
    stream.on('text', (text) => emit({ type: 'text', text }))
    const final = await stream.finalMessage()

    if (final.stop_reason === 'refusal') {
      emit({
        type: 'error',
        message: "L'assistant n'a pas pu répondre à ce message. Reformulez-le.",
      })
      return
    }

    const text = final.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
    if (text) spoke = true
    const toolUses = final.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    const rows: NewMessage[] = [
      { role: 'assistant', content: final.content, display: text || null },
    ]
    if (toolUses.length > 0) {
      // Un tool_use coupé par max_tokens a une entrée tronquée : on ne l'exécute pas.
      const truncated = final.stop_reason === 'max_tokens'
      const results: Anthropic.ToolResultBlockParam[] = []
      for (const block of toolUses) {
        results.push(
          truncated
            ? {
                type: 'tool_result',
                tool_use_id: block.id,
                is_error: true,
                content: 'entrée tronquée, recommencez',
              }
            : await applyToolCall(db, form, respondent.id, block, track),
        )
      }
      // Tous les résultats dans UN message utilisateur, juste après le tour assistant.
      rows.push({ role: 'user', content: results, display: null })
    }
    await appendMessages(db, respondent.id, rows)
    // Rien à attendre du modèle après le seul affichage de la question : le tour est fini, et
    // le message suivant du répondant suivra ce tool_result (deux messages `user` d'affilée,
    // que l'API fusionne).
    if (toolUses.every((b) => b.name === PRESENT_QUESTION_TOOL)) break
  }

  // Filet de sécurité : boutons de la question en cours si le modèle n'a pas appelé l'outil.
  if (!presented) {
    const pending = pendingQuestion(
      form,
      await loadMessages(db, respondent.id),
      await loadAnswers(db, respondent.id),
    )
    if (pending) emit({ type: 'question', ...pending })
  }

  // Le modèle a parfois affiché les boutons sans écrire la question : on l'écrit à sa place.
  const silent = !spoke && presented && allQuestions(form).find((q) => q.id === presented)
  if (silent) {
    emit({ type: 'message_start' })
    emit({ type: 'text', text: silent.label })
    await appendMessages(db, respondent.id, [
      { role: 'assistant', content: [{ type: 'text', text: silent.label }], display: silent.label },
    ])
  }
}

/**
 * Question en attente de réponse (boutons sous le fil, en direct comme après un
 * rechargement) : le dernier `present_question` qui n'a pas été suivi d'un message du
 * répondant. Le modèle oublie parfois l'outil : si son dernier message contient une
 * question, on retient celle qui suit la dernière remplie (`nextQuestion`).
 */
export function pendingQuestion(
  form: Form,
  rows: { role: 'user' | 'assistant'; content: unknown[]; display: string | null }[],
  answers: Answers,
): { questionId: string; suggestions: string[] } | null {
  let pending: { questionId: string; suggestions: string[] } | null = null
  let lastText: string | null = null
  for (const m of rows) {
    if (m.role === 'user' && m.display !== null) pending = null
    if (m.display !== null) lastText = m.role === 'assistant' ? m.display : null
    if (m.role !== 'assistant') continue
    for (const block of m.content as { type?: string; name?: string; input?: unknown }[]) {
      if (block.type !== 'tool_use' || block.name !== PRESENT_QUESTION_TOOL) continue
      const input = presentInputSchema.safeParse(block.input)
      const q = input.success && allQuestions(form).find((x) => x.id === input.data.question_id)
      if (q)
        pending = { questionId: q.id, suggestions: mergeSuggestions(q, input.data.suggestions) }
    }
  }
  if (pending || !lastText?.includes('?')) return pending
  const next = nextQuestion(form, answers)
  return next ? { questionId: next.id, suggestions: mergeSuggestions(next, []) } : null
}

/**
 * Question que l'IA pose a priori : la première vide après la dernière remplie (une
 * facultative passée reste vide derrière), sinon la première vide.
 */
export function nextQuestion(form: Form, answers: Answers): Question | undefined {
  const all = allQuestions(form)
  const last = all.findLastIndex((q) => answers[q.id] !== undefined)
  const empty = (q: Question) => answers[q.id] === undefined
  return all.slice(last + 1).find(empty) ?? all.find(empty)
}

/** Messages visibles du fil (le reste est technique : état, outils). */
export function visibleMessages(rows: Awaited<ReturnType<typeof loadMessages>>) {
  return rows
    .filter((m) => m.display !== null)
    .map((m) => ({ id: m.id, role: m.role, text: m.display as string }))
}
