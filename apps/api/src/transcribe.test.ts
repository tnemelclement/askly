import { afterEach, describe, expect, it, vi } from 'vitest'
import { transcribe } from './transcribe.ts'

const config = { apiKey: 'k', baseUrl: 'https://api.example.com/v1/', model: 'whisper-1' }
const audio = { filename: 'dictee.webm', contentType: 'audio/webm', body: Buffer.from('son') }

describe('dictée', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('appelle /audio/transcriptions au format OpenAI', async () => {
    const fetch = vi.fn(async () => Response.json({ text: ' Bonjour. ' }))
    vi.stubGlobal('fetch', fetch)
    expect(await transcribe(config, audio)).toBe('Bonjour.')
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.example.com/v1/audio/transcriptions')
    expect(init.headers).toEqual({ authorization: 'Bearer k' })
    const form = init.body as FormData
    expect(form.get('model')).toBe('whisper-1')
    expect((form.get('file') as File).name).toBe('dictee.webm')
  })

  it('renvoie une erreur 502 si le fournisseur échoue', async () => {
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 401 }))
    await expect(transcribe(config, audio)).rejects.toMatchObject({ statusCode: 502 })
  })
})
