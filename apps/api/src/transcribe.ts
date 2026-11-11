import { HttpError } from './errors.ts'

/**
 * Dictée : l'audio part vers une API de transcription au format OpenAI
 * (`POST {baseUrl}/audio/transcriptions`, multipart `file` + `model`), que servent aussi
 * Mistral (Voxtral), Groq ou un serveur Whisper auto-hébergé.
 */
export type TranscriptionConfig = { apiKey: string; baseUrl: string; model: string }

export async function transcribe(
  config: TranscriptionConfig,
  audio: { filename: string; contentType: string; body: Buffer },
): Promise<string> {
  const form = new FormData()
  form.append(
    'file',
    new Blob([new Uint8Array(audio.body)], { type: audio.contentType }),
    audio.filename,
  )
  form.append('model', config.model)
  form.append('language', 'fr')
  const res = await fetch(`${config.baseUrl.replace(/\/$/, '')}/audio/transcriptions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.apiKey}` },
    body: form,
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new HttpError(502, 'La transcription a échoué, réessayez ou écrivez.')
  const { text } = (await res.json()) as { text?: string }
  return (text ?? '').trim()
}
