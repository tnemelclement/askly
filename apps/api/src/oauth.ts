import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

/**
 * Serveur d'autorisation OAuth 2.1 minimal pour le connecteur MCP de claude.ai : découverte
 * (RFC 8414, RFC 9728), enregistrement dynamique des clients (RFC 7591), code
 * d'autorisation avec PKCE S256, jeton de rafraîchissement. L'utilisateur se connecte avec
 * le mot de passe admin.
 *
 * Sans état : client_id, codes et jetons sont des charges utiles signées (HMAC dérivé
 * d'ADMIN_PASSWORD). Changer le mot de passe révoque donc tout.
 * shortcut: un code d'autorisation n'est pas à usage unique (il expire en 5 min, et PKCE exige le code_verifier) ; stocker les codes consommés en base si on veut l'interdire.
 */

const CODE_TTL = 5 * 60
const ACCESS_TTL = 60 * 60
const REFRESH_TTL = 90 * 24 * 60 * 60

type Payload = Record<string, unknown> & { typ: string }

export interface Signer {
  sign(payload: Payload, ttlSeconds: number): string
  verify(token: string, typ: string): Payload | null
}

export function createSigner(secret: string): Signer {
  const key = createHmac('sha256', secret).update('oauth-signing-key').digest()
  const mac = (data: string) => createHmac('sha256', key).update(data).digest('base64url')
  return {
    sign(payload, ttl) {
      const body = Buffer.from(
        JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttl }),
      ).toString('base64url')
      return `${body}.${mac(body)}`
    },
    verify(token, typ) {
      const [body, sig] = token.split('.')
      if (!body || !sig) return null
      const expected = Buffer.from(mac(body))
      const given = Buffer.from(sig)
      if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
      try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as Payload & {
          exp: number
        }
        if (payload.typ !== typ || payload.exp < Date.now() / 1000) return null
        return payload
      } catch {
        return null
      }
    },
  }
}

export function verifyAccessToken(signer: Signer, token: string): boolean {
  return signer.verify(token, 'access') !== null
}

/** Retours de connexion acceptés : claude.ai / claude.com, et la machine locale (Claude Code). */
export function isAllowedRedirect(uri: string): boolean {
  try {
    const u = new URL(uri)
    if (u.protocol === 'https:') return u.hostname === 'claude.ai' || u.hostname === 'claude.com'
    return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')
  } catch {
    return false
  }
}

export function pkceMatches(verifier: string, challenge: string): boolean {
  return createHash('sha256').update(verifier).digest('base64url') === challenge
}

/**
 * Freine la force brute sur le mot de passe : 10 échecs par quart d'heure, toutes IP
 * confondues (il n'y a qu'un administrateur).
 * shortcut: compteur en mémoire, par instance ; le mettre en base si l'API tourne en plusieurs exemplaires.
 */
export function createLoginLimiter(max = 10, windowMs = 15 * 60 * 1000) {
  let failures: number[] = []
  return {
    blocked() {
      failures = failures.filter((t) => t > Date.now() - windowMs)
      return failures.length >= max
    },
    fail() {
      failures.push(Date.now())
    },
  }
}

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  )

const authorizeQuery = z.object({
  response_type: z.literal('code'),
  client_id: z.string().max(4000),
  redirect_uri: z.string().max(2000),
  code_challenge: z.string().min(43).max(128),
  code_challenge_method: z.literal('S256'),
  state: z.string().max(2000).optional(),
  scope: z.string().max(500).optional(),
  resource: z.string().max(2000).optional(),
})

function loginPage(params: z.infer<typeof authorizeQuery>, clientName: string, error?: string) {
  const hidden = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(
      ([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(String(v))}">`,
    )
    .join('')
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Autoriser l'accès</title>
<style>
body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#f4f4f4;color:#0b0b0c;font:15px/1.55 "Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased}
main{width:min(380px,calc(100vw - 32px));background:#fff;border:1px solid #e6e6e3;border-radius:11px;padding:28px;box-shadow:0 1px 2px #0000000a,0 4px 16px #0000000a}
h1{font-size:20px;letter-spacing:-.02em;margin:0 0 6px}p{color:#6e6e6b;margin:0 0 20px}
label{display:block;font-size:13px;font-weight:500;margin-bottom:6px}
input[type=password]{box-sizing:border-box;width:100%;height:40px;border:1px solid #e6e6e3;border-radius:8px;padding:0 14px;font:inherit}
input[type=password]:focus{outline:none;border-color:#0b0b0c}
button{margin-top:16px;width:100%;height:40px;border:0;border-radius:8px;background:#0b0b0c;color:#fff;font:inherit;font-weight:500;cursor:pointer}
button:hover{opacity:.85}.error{color:#c4321f;font-size:13px;margin:8px 0 0}
</style></head><body><main>
<h1>Autoriser ${escapeHtml(clientName)}</h1>
<p>Accès complet à vos questionnaires : création, liens, réponses.</p>
<form method="post" action="/oauth/authorize">${hidden}
<label for="password">Mot de passe administrateur</label>
<input id="password" name="password" type="password" autocomplete="current-password" autofocus required>
${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ''}
<button type="submit">Autoriser</button>
</form></main></body></html>`
}

export function registerOAuth(
  app: FastifyInstance,
  opts: {
    adminPassword: string
    origin: (req: FastifyRequest) => string
    signer: Signer
    safeEqual: (a: string, b: string) => boolean
    limiter: ReturnType<typeof createLoginLimiter>
  },
) {
  const { signer, origin, safeEqual, limiter } = opts

  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_req, body, done) => done(null, Object.fromEntries(new URLSearchParams(body as string))),
  )

  const resourceMetadata = (req: FastifyRequest) => ({
    resource: `${origin(req)}/mcp`,
    authorization_servers: [origin(req)],
    bearer_methods_supported: ['header'],
  })
  app.get('/.well-known/oauth-protected-resource', async (req) => resourceMetadata(req))
  app.get('/.well-known/oauth-protected-resource/mcp', async (req) => resourceMetadata(req))

  app.get('/.well-known/oauth-authorization-server', async (req) => ({
    issuer: origin(req),
    authorization_endpoint: `${origin(req)}/oauth/authorize`,
    token_endpoint: `${origin(req)}/oauth/token`,
    registration_endpoint: `${origin(req)}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['questionnaires'],
  }))

  // Enregistrement dynamique : le client_id porte, signés, ses adresses de retour.
  app.post('/oauth/register', async (req, reply) => {
    const body = z
      .object({
        redirect_uris: z.array(z.string().max(2000)).min(1).max(10),
        client_name: z.string().max(200).optional(),
      })
      .safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'invalid_client_metadata' })
    const bad = body.data.redirect_uris.find((u) => !isAllowedRedirect(u))
    if (bad) {
      return reply.code(400).send({
        error: 'invalid_redirect_uri',
        error_description: `Adresse de retour non autorisée : ${bad}`,
      })
    }
    const name = body.data.client_name ?? 'Client MCP'
    const client_id = signer.sign(
      { typ: 'client', redirect_uris: body.data.redirect_uris, name },
      10 * 365 * 24 * 60 * 60,
    )
    return reply.code(201).send({
      client_id,
      client_name: name,
      redirect_uris: body.data.redirect_uris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    })
  })

  /** Valide la demande ; renvoie le client, ou répond lui-même par une erreur. */
  function checkAuthorize(raw: unknown, reply: FastifyReply) {
    const params = authorizeQuery.safeParse(raw)
    if (!params.success) {
      reply.code(400).type('text/plain; charset=utf-8').send('Demande d’autorisation invalide.')
      return null
    }
    const client = signer.verify(params.data.client_id, 'client') as {
      redirect_uris: string[]
      name: string
    } | null
    // Adresse de retour inconnue : on n'y redirige jamais, on s'arrête ici.
    if (!client?.redirect_uris.includes(params.data.redirect_uri)) {
      reply
        .code(400)
        .type('text/plain; charset=utf-8')
        .send('Client ou adresse de retour inconnus.')
      return null
    }
    return { params: params.data, client }
  }

  app.get('/oauth/authorize', async (req, reply) => {
    const ok = checkAuthorize(req.query, reply)
    if (!ok) return reply
    return reply.type('text/html; charset=utf-8').send(loginPage(ok.params, ok.client.name))
  })

  app.post('/oauth/authorize', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, string>
    const ok = checkAuthorize(body, reply)
    if (!ok) return reply
    const html = (error: string) =>
      reply.type('text/html; charset=utf-8').send(loginPage(ok.params, ok.client.name, error))
    if (limiter.blocked()) return html('Trop de tentatives. Réessayez dans un quart d’heure.')
    if (!safeEqual(body.password ?? '', opts.adminPassword)) {
      limiter.fail()
      return html('Mot de passe incorrect.')
    }
    const code = signer.sign(
      {
        typ: 'code',
        cid: ok.params.client_id,
        ru: ok.params.redirect_uri,
        cc: ok.params.code_challenge,
      },
      CODE_TTL,
    )
    const target = new URL(ok.params.redirect_uri)
    target.searchParams.set('code', code)
    if (ok.params.state) target.searchParams.set('state', ok.params.state)
    return reply.redirect(target.toString(), 302)
  })

  app.post('/oauth/token', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, string>
    const fail = (error: string, description?: string) =>
      reply.code(400).send({ error, ...(description && { error_description: description }) })
    reply.header('cache-control', 'no-store')

    let clientId: string
    if (body.grant_type === 'authorization_code') {
      const code = signer.verify(body.code ?? '', 'code')
      if (!code) return fail('invalid_grant', 'code invalide ou expiré')
      if (code.ru !== body.redirect_uri || (body.client_id && code.cid !== body.client_id)) {
        return fail('invalid_grant', 'redirect_uri ou client_id différent')
      }
      if (!body.code_verifier || !pkceMatches(body.code_verifier, String(code.cc))) {
        return fail('invalid_grant', 'code_verifier invalide')
      }
      clientId = String(code.cid)
    } else if (body.grant_type === 'refresh_token') {
      const refresh = signer.verify(body.refresh_token ?? '', 'refresh')
      if (!refresh) return fail('invalid_grant', 'refresh_token invalide ou expiré')
      clientId = String(refresh.cid)
    } else {
      return fail('unsupported_grant_type')
    }
    return {
      access_token: signer.sign({ typ: 'access', cid: clientId }, ACCESS_TTL),
      token_type: 'Bearer',
      expires_in: ACCESS_TTL,
      refresh_token: signer.sign({ typ: 'refresh', cid: clientId }, REFRESH_TTL),
      scope: 'questionnaires',
    }
  })
}
