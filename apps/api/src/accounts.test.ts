import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { type Account, hashPassword, isActive, verifyPassword } from './accounts.ts'
import { verifyWebhook } from './billing.ts'

const account = (over: Partial<Account>) => ({ plan: 'trial', ...over }) as Account

describe('comptes', () => {
  it('vérifie un mot de passe haché', async () => {
    const hash = await hashPassword('correct-horse')
    expect(await verifyPassword('correct-horse', hash)).toBe(true)
    expect(await verifyPassword('autre', hash)).toBe(false)
    expect(await verifyPassword('x', '')).toBe(false)
  })

  it('dit si le compte est actif selon le plan', () => {
    const now = new Date('2026-06-15')
    expect(isActive(account({ plan: 'unlimited' }), now)).toBe(true)
    expect(isActive(account({ trialEndsAt: new Date('2026-06-20') }), now)).toBe(true)
    expect(isActive(account({ trialEndsAt: new Date('2026-06-10') }), now)).toBe(false)
    expect(isActive(account({ plan: 'pro', subscriptionStatus: 'active' }), now)).toBe(true)
    expect(isActive(account({ plan: 'pro', subscriptionStatus: 'past_due' }), now)).toBe(true)
    expect(isActive(account({ plan: 'solo', subscriptionStatus: 'canceled' }), now)).toBe(false)
  })
})

describe('webhook Stripe', () => {
  const secret = 'whsec_test'
  const body = Buffer.from('{"type":"customer.subscription.updated"}')
  const sign = (t: number) =>
    `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`
  const now = 1_800_000_000_000

  it('accepte une signature valide et récente', () => {
    expect(verifyWebhook(body, sign(now / 1000), secret, now)).toBe(true)
  })

  it('refuse une signature fausse, absente ou trop vieille', () => {
    expect(verifyWebhook(body, sign(now / 1000), 'autre', now)).toBe(false)
    expect(verifyWebhook(body, undefined, secret, now)).toBe(false)
    expect(verifyWebhook(body, sign(now / 1000 - 600), secret, now)).toBe(false)
    expect(verifyWebhook(Buffer.from('{}'), sign(now / 1000), secret, now)).toBe(false)
  })
})
