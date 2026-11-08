import type Anthropic from '@anthropic-ai/sdk'
import type { Db } from '@questionnaire/db'
import { z } from 'zod'
import {
  type Answers,
  type AnswerValue,
  allQuestions,
  type Form,
  formatAnswer,
  missingRequired,
  type Question,
  validateAnswer,
} from './domain.ts'
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
/** Garde-fou contre une boucle d'outils sans fin dans un même tour. */
const MAX_STEPS = 6

export type ChatEvent =
  | { type: 'message_start' }
  | { type: 'text'; text: string }
  | { type: 'answer'; questionId: string; value: AnswerValue }
  | { type: 'error'; message: string }
  | { type: 'done' }

const TYPE_HINTS: Record<Question['type'], string> = {
  text: 'texte court (chaîne)',
  longtext: 'texte libre (chaîne), reformulé fidèlement si besoin',
  choice: 'UNE option, recopiée exactement (chaîne)',
  multichoice: 'liste des options choisies, recopiées exactement (tableau de chaînes)',
  number: 'nombre JSON (ex. 1500), sans unité',
  date: 'chaîne AAAA-MM-JJ',
  yesno: 'booléen JSON true ou false',
}

function describeQuestion(q: Question): string {
  const lines = [`- ${q.id} — ${q.label}${q.required ? '' : ' (facultative)'}`]
  lines.push(`  type : ${TYPE_HINTS[q.type]}`)
  if (q.options) lines.push(`  options : ${q.options.map((o) => `"${o}"`).join(', ')}`)
  if (q.help) lines.push(`  aide : ${q.help.trim()}`)
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
- Pour une question à choix, proposez les options telles quelles.
- Si la personne ne comprend pas ou demande des précisions, expliquez simplement, avec un exemple concret, puis aidez-la à formuler sa réponse. Appuyez-vous sur l'« aide » de la question.
- Dès qu'une réponse est claire, enregistrez-la avec l'outil ${RECORD_ANSWER_TOOL}, puis enchaînez. Une réponse peut en couvrir plusieurs : enregistrez chacune.
- Si la réponse est ambiguë ou incomplète, demandez une précision au lieu de deviner. N'inventez jamais une réponse.
- Si la personne corrige une réponse précédente, réenregistrez-la.
- Une question facultative peut être passée si la personne ne souhaite pas répondre.
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

/** État joint à chaque message du répondant : ce qui est rempli, ce qui manque. */
export function describeState(form: Form, answers: Answers): string {
  const lines = allQuestions(form).map((q) =>
    answers[q.id] === undefined
      ? `- ${q.id} : (vide)${q.required ? '' : ' facultative'}`
      : `- ${q.id} : ${formatAnswer(q, answers[q.id])}`,
  )
  const missing = missingRequired(form, answers).length
  return `<etat_du_questionnaire>\n${lines.join('\n')}\n${missing === 0 ? 'Toutes les questions obligatoires sont remplies.' : `${missing} question(s) obligatoire(s) restante(s).`}\n</etat_du_questionnaire>`
}

const toolInputSchema = z.object({ question_id: z.string(), value: z.unknown() })

/** Applique un appel `record_answer` : validation, enregistrement, résultat pour le modèle. */
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
  if (block.name !== RECORD_ANSWER_TOOL) return fail(`outil inconnu : ${block.name}`)
  const input = toolInputSchema.safeParse(block.input)
  if (!input.success) return fail('entrée invalide : { question_id, value } attendu')
  const result = validateAnswer(form, input.data.question_id, input.data.value)
  if (!result.ok) return fail(result.error)
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

  const state = describeState(form, await loadAnswers(db, respondent.id))
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
  const tools = [buildRecordAnswerTool(form)]

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
            : await applyToolCall(db, form, respondent.id, block, emit),
        )
      }
      // Tous les résultats dans UN message utilisateur, juste après le tour assistant.
      rows.push({ role: 'user', content: results, display: null })
    }
    await appendMessages(db, respondent.id, rows)
    if (toolUses.length === 0) return
  }
}

/** Messages visibles du fil (le reste est technique : état, outils). */
export function visibleMessages(rows: Awaited<ReturnType<typeof loadMessages>>) {
  return rows
    .filter((m) => m.display !== null)
    .map((m) => ({ id: m.id, role: m.role, text: m.display as string }))
}
