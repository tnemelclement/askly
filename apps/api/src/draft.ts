import type Anthropic from '@anthropic-ai/sdk'
import { stringify } from 'yaml'
import { z } from 'zod'
import { AI_MODEL } from './ai.ts'
import { formSchema } from './domain.ts'
import { HttpError } from './errors.ts'
import { INSTRUCTIONS } from './mcp.ts'

/**
 * Rédaction d'un questionnaire par l'IA à partir d'une description libre, pour les comptes
 * qui ne passent pas par Claude (MCP). Renvoie du YAML que l'utilisateur relit avant
 * d'enregistrer : la validation se fait à l'enregistrement, comme pour un YAML écrit à la main.
 */

const DRAFT_TOOL = 'write_questionnaire'

export async function draftForm(client: Anthropic, brief: string): Promise<string> {
  const message = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 8000,
    system: `You write questionnaires for Askly from the user's description. Call ${DRAFT_TOOL} exactly once with the full definition.\n\n${INSTRUCTIONS}`,
    tools: [
      {
        name: DRAFT_TOOL,
        description: 'Save the questionnaire definition.',
        input_schema: z.toJSONSchema(formSchema, { io: 'input' }) as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: 'tool', name: DRAFT_TOOL },
    messages: [{ role: 'user', content: brief }],
  })
  const call = message.content.find((b) => b.type === 'tool_use')
  if (!call || message.stop_reason === 'max_tokens') {
    throw new HttpError(502, 'La rédaction a échoué, réessayez avec une description plus courte.')
  }
  return stringify(call.input, { lineWidth: 100 })
}

/**
 * Freine le coût : 30 brouillons par compte et par jour.
 * shortcut: compteur en mémoire, remis à zéro au redémarrage ; le mettre en base si on lance plusieurs instances.
 */
export function createDraftLimiter(max = 30) {
  const counts = new Map<string, { day: string; n: number }>()
  return (accountId: string) => {
    const day = new Date().toISOString().slice(0, 10)
    const current = counts.get(accountId)
    const n = current?.day === day ? current.n : 0
    if (n >= max) throw new HttpError(429, 'Limite de rédactions atteinte pour aujourd’hui')
    counts.set(accountId, { day, n: n + 1 })
  }
}
