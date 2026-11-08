import type { Answers, ChatEvent } from '@questionnaire/api/domain'

export type { ChatEvent }

/** Appels à l'API (relayée sur `/api` par Vite en dev). */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? (init?.body === undefined ? 'GET' : 'POST'),
    headers: init?.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null
    throw new ApiError(res.status, data?.error ?? `Erreur ${res.status}`)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

/** Envoie un message (ou `null` pour ouvrir la conversation) et lit le flux NDJSON. */
export async function streamChat(
  token: string,
  message: string | null,
  onEvent: (e: ChatEvent) => void,
): Promise<void> {
  const res = await fetch(`/api/r/${token}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message }),
  })
  if (res.status === 204) return
  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null
    throw new ApiError(res.status, data?.error ?? `Erreur ${res.status}`)
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) if (line.trim()) onEvent(JSON.parse(line) as ChatEvent)
  }
}

export type FileInfo = { id: string; filename: string; contentType: string; size: number }

/** Joint un fichier à une question `file` (multipart). */
export async function uploadFile(token: string, questionId: string, file: File) {
  const body = new FormData()
  body.append('file', file)
  const res = await fetch(`/api/r/${token}/files/${questionId}`, { method: 'POST', body })
  const data = (await res.json().catch(() => null)) as {
    error?: string
    file: FileInfo
    answers: Answers
    files: Record<string, FileInfo>
  } | null
  if (!res.ok || !data) throw new ApiError(res.status, data?.error ?? `Erreur ${res.status}`)
  return data
}

/** Formats acceptés à l'envoi (même liste que le serveur), pour le sélecteur de fichiers. */
export const UPLOAD_ACCEPT =
  'image/*,application/pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.zip'
export const MAX_UPLOAD_MB = 20
