import { createHash } from 'node:crypto'
import type Anthropic from '@anthropic-ai/sdk'
import type { Db } from '@questionnaire/db'
import { describe, expect, it } from 'vitest'
import { buildApp } from './app.ts'
import { isPrivateAddress } from './files.ts'
import { createLoginLimiter, createSigner, isAllowedRedirect, pkceMatches } from './oauth.ts'

// Ni base ni IA : ces tests ne couvrent que l'authentification et la découverte des outils.
const app = buildApp({
  db: {} as Db,
  anthropic: {} as Anthropic,
  adminPassword: 'mot-de-passe-de-test',
  apiToken: 'j'.repeat(40),
  publicUrl: 'https://ask.example.test',
})

const rpc = (body: object, token?: string) =>
  app.inject({
    method: 'POST',
    url: '/mcp',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(token && { authorization: `Bearer ${token}` }),
    },
    payload: { jsonrpc: '2.0', id: 1, ...body },
  })

const listTools = (token: string) => rpc({ method: 'tools/list', params: {} }, token)

describe('MCP', () => {
  it('refuse sans jeton et indique où s’authentifier', async () => {
    const res = await listTools('')
    expect(res.statusCode).toBe(401)
    expect(res.headers['www-authenticate']).toContain(
      'https://ask.example.test/.well-known/oauth-protected-resource',
    )
    expect((await listTools('faux')).statusCode).toBe(401)
  })

  it('liste les outils avec le jeton d’API', async () => {
    const res = await listTools('j'.repeat(40))
    expect(res.statusCode).toBe(200)
    const names = (res.json().result.tools as { name: string }[]).map((t) => t.name).sort()
    expect(names).toEqual([
      'create_form',
      'create_respondent',
      'delete_form',
      'delete_respondent',
      'get_answers',
      'get_file',
      'get_form',
      'get_respondent',
      'list_forms',
      'reopen_respondent',
      'set_answer',
      'update_form',
      'update_respondent',
      'upload_image',
    ])
  })
})

describe('OAuth', () => {
  const redirect = 'https://claude.ai/api/mcp/auth_callback'
  const verifier = 'v'.repeat(64)
  const challenge = createHash('sha256').update(verifier).digest('base64url')

  it('publie les métadonnées de découverte', async () => {
    const meta = (await app.inject('/.well-known/oauth-authorization-server')).json()
    expect(meta.token_endpoint).toBe('https://ask.example.test/oauth/token')
    expect(meta.code_challenge_methods_supported).toEqual(['S256'])
    const resource = (await app.inject('/.well-known/oauth-protected-resource/mcp')).json()
    expect(resource.resource).toBe('https://ask.example.test/mcp')
  })

  it('refuse une adresse de retour hors claude.ai / localhost', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/oauth/register',
      payload: { redirect_uris: ['https://pirate.example/cb'] },
    })
    expect(res.statusCode).toBe(400)
  })

  it('échappe le nom du client dans la page de connexion', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/oauth/register',
      payload: { redirect_uris: [redirect], client_name: '<script>alert(1)</script>' },
    })
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: reg.json().client_id,
      redirect_uri: redirect,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    })
    const page = await app.inject({ url: `/oauth/authorize?${query}` })
    expect(page.body).not.toContain('<script>alert')
    expect(page.body).toContain('&lt;script&gt;')
  })

  it('déroule enregistrement → connexion → jeton → appel MCP', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/oauth/register',
      payload: { redirect_uris: [redirect], client_name: 'Claude' },
    })
    expect(reg.statusCode).toBe(201)
    const { client_id } = reg.json()
    const params = {
      response_type: 'code',
      client_id,
      redirect_uri: redirect,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'etat-42',
    }
    const page = await app.inject({ url: `/oauth/authorize?${new URLSearchParams(params)}` })
    expect(page.statusCode).toBe(200)
    expect(page.body).toContain('Autoriser Claude')

    const post = (password: string) =>
      app.inject({
        method: 'POST',
        url: '/oauth/authorize',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: new URLSearchParams({ ...params, password }).toString(),
      })
    expect((await post('mauvais')).body).toContain('Mot de passe incorrect')
    const ok = await post('mot-de-passe-de-test')
    expect(ok.statusCode).toBe(302)
    const location = new URL(ok.headers.location as string)
    expect(location.origin + location.pathname).toBe(redirect)
    expect(location.searchParams.get('state')).toBe('etat-42')
    const code = location.searchParams.get('code') ?? ''

    const token = (payload: Record<string, string>) =>
      app.inject({
        method: 'POST',
        url: '/oauth/token',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: new URLSearchParams(payload).toString(),
      })
    const bad = await token({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirect,
      client_id,
      code_verifier: 'w'.repeat(64),
    })
    expect(bad.statusCode).toBe(400)
    const granted = await token({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirect,
      client_id,
      code_verifier: verifier,
    })
    expect(granted.statusCode).toBe(200)
    const { access_token, refresh_token } = granted.json()
    expect((await listTools(access_token)).statusCode).toBe(200)

    const refreshed = await token({ grant_type: 'refresh_token', refresh_token, client_id })
    expect((await listTools(refreshed.json().access_token)).statusCode).toBe(200)
    // Un jeton de rafraîchissement n'ouvre pas le MCP.
    expect((await listTools(refresh_token)).statusCode).toBe(401)
  })
})

describe('briques OAuth', () => {
  it('signe, vérifie le type et l’expiration', () => {
    const s = createSigner('secret')
    const t = s.sign({ typ: 'access' }, 60)
    expect(s.verify(t, 'access')).not.toBeNull()
    expect(s.verify(t, 'refresh')).toBeNull()
    expect(s.verify(`${t}x`, 'access')).toBeNull()
    expect(createSigner('autre').verify(t, 'access')).toBeNull()
    expect(s.verify(s.sign({ typ: 'access' }, -1), 'access')).toBeNull()
  })

  it('n’accepte que les retours claude.ai, claude.com et locaux', () => {
    expect(isAllowedRedirect('https://claude.ai/api/mcp/auth_callback')).toBe(true)
    expect(isAllowedRedirect('http://localhost:33418/callback')).toBe(true)
    expect(isAllowedRedirect('http://claude.ai/cb')).toBe(false)
    expect(isAllowedRedirect('https://claude.ai.pirate.example/cb')).toBe(false)
    expect(isAllowedRedirect('javascript:alert(1)')).toBe(false)
  })

  it('vérifie PKCE S256', () => {
    const v = 'a'.repeat(50)
    expect(pkceMatches(v, createHash('sha256').update(v).digest('base64url'))).toBe(true)
    expect(pkceMatches(v, 'autre')).toBe(false)
  })

  it('bloque après trop d’échecs', () => {
    const l = createLoginLimiter(2)
    l.fail()
    expect(l.blocked()).toBe(false)
    l.fail()
    expect(l.blocked()).toBe(true)
  })
})

describe('protection SSRF de upload_image', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '::1',
    'fd00::1',
    '::ffff:10.0.0.1',
  ])('refuse %s', (ip) => expect(isPrivateAddress(ip)).toBe(true))
  it('accepte une adresse publique', () => {
    expect(isPrivateAddress('51.83.46.173')).toBe(false)
    expect(isPrivateAddress('2001:4860:4860::8888')).toBe(false)
  })
})
