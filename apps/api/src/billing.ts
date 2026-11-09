import { createHmac, timingSafeEqual } from 'node:crypto'
import { accounts, type Db } from '@askly/db'
import { eq } from 'drizzle-orm'
import type { Account } from './accounts.ts'
import { HttpError } from './errors.ts'

/**
 * Abonnements Stripe, par l'API REST (pas de SDK) : Checkout pour souscrire, portail client
 * pour changer d'offre, de carte ou résilier, webhook pour tenir le compte à jour.
 */

export interface BillingConfig {
  secretKey: string
  webhookSecret: string
  prices: { solo: string; pro: string }
}

export type PaidPlan = keyof BillingConfig['prices']

async function stripe<T>(cfg: BillingConfig, path: string, params: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${cfg.secretKey}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(15_000),
  })
  const data = (await res.json()) as T & { error?: { message?: string } }
  if (!res.ok) throw new HttpError(502, `Stripe : ${data.error?.message ?? res.status}`)
  return data
}

/** Page de paiement Stripe pour souscrire `plan` ; renvoie son adresse. */
export async function createCheckout(
  cfg: BillingConfig,
  account: Account,
  plan: PaidPlan,
  origin: string,
) {
  const session = await stripe<{ url: string }>(cfg, 'checkout/sessions', {
    mode: 'subscription',
    'line_items[0][price]': cfg.prices[plan],
    'line_items[0][quantity]': '1',
    success_url: `${origin}/admin/account?billing=success`,
    cancel_url: `${origin}/admin/account`,
    client_reference_id: account.id,
    'subscription_data[metadata][accountId]': account.id,
    allow_promotion_codes: 'true',
    ...(account.stripeCustomerId
      ? { customer: account.stripeCustomerId }
      : { customer_email: account.email }),
  })
  return session.url
}

/** Portail client Stripe (factures, carte, changement d'offre, résiliation). */
export async function createPortal(cfg: BillingConfig, account: Account, origin: string) {
  if (!account.stripeCustomerId) throw new HttpError(400, 'Aucun abonnement à gérer')
  const session = await stripe<{ url: string }>(cfg, 'billing_portal/sessions', {
    customer: account.stripeCustomerId,
    return_url: `${origin}/admin/account`,
  })
  return session.url
}

/** Vérifie l'en-tête `stripe-signature` (HMAC SHA-256 de `t.corps`, 5 min de tolérance). */
export function verifyWebhook(
  raw: Buffer,
  header: string | undefined,
  secret: string,
  now = Date.now(),
): boolean {
  const parts = (header ?? '').split(',').map((p) => p.split('=') as [string, string])
  const t = parts.find(([k]) => k === 't')?.[1]
  if (!t || Math.abs(now / 1000 - Number(t)) > 300) return false
  const expected = Buffer.from(
    createHmac('sha256', secret)
      .update(`${t}.${raw.toString('utf8')}`)
      .digest('hex'),
  )
  return parts
    .filter(([k]) => k === 'v1')
    .some(([, v]) => {
      const given = Buffer.from(v ?? '')
      return given.length === expected.length && timingSafeEqual(given, expected)
    })
}

interface StripeEvent {
  type: string
  data: { object: Record<string, unknown> }
}

/** Applique un événement Stripe au compte concerné ; ignore les autres événements. */
export async function handleEvent(db: Db, cfg: BillingConfig, event: StripeEvent) {
  const obj = event.data.object
  if (event.type === 'checkout.session.completed') {
    const accountId = obj.client_reference_id
    if (typeof accountId === 'string' && typeof obj.customer === 'string') {
      await db
        .update(accounts)
        .set({ stripeCustomerId: obj.customer })
        .where(eq(accounts.id, accountId))
    }
    return
  }
  if (!event.type.startsWith('customer.subscription.')) return
  const sub = obj as {
    customer: string
    status: string
    metadata?: { accountId?: string }
    items?: { data?: { price?: { id?: string } }[] }
  }
  const account = sub.metadata?.accountId
    ? await db.query.accounts.findFirst({ where: eq(accounts.id, sub.metadata.accountId) })
    : await db.query.accounts.findFirst({ where: eq(accounts.stripeCustomerId, sub.customer) })
  // Le propriétaire de l'instance reste illimité, quoi qu'il souscrive.
  if (!account || account.plan === 'unlimited') return
  const price = sub.items?.data?.[0]?.price?.id
  const plan = price === cfg.prices.pro ? 'pro' : price === cfg.prices.solo ? 'solo' : undefined
  await db
    .update(accounts)
    .set({
      stripeCustomerId: sub.customer,
      subscriptionStatus: event.type === 'customer.subscription.deleted' ? 'canceled' : sub.status,
      ...(plan && { plan }),
    })
    .where(eq(accounts.id, account.id))
}
