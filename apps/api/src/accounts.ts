import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { accounts, type Db, respondents } from '@askly/db'
import { and, count, eq, gte, sql } from 'drizzle-orm'
import { HttpError } from './errors.ts'

/**
 * Comptes, plans et quotas. Une instance auto-hébergée n'a que le compte propriétaire
 * (plan `unlimited`, créé depuis ADMIN_EMAIL / ADMIN_PASSWORD) ; le SaaS ouvre l'inscription.
 */

export type Account = typeof accounts.$inferSelect
export type Plan = Account['plan']

/** Compte qui a reçu les données d'avant les comptes (migration 0003). */
export const OWNER_ID = '00000000-0000-0000-0000-000000000001'
export const TRIAL_DAYS = 14

/** `responses` = personnes qui commencent un questionnaire dans le mois. */
export const PLANS: Record<
  Plan,
  { label: string; responses: number; files: boolean; mcp: boolean }
> = {
  trial: { label: 'Essai', responses: 20, files: true, mcp: true },
  solo: { label: 'Solo', responses: 50, files: false, mcp: false },
  pro: { label: 'Pro', responses: 500, files: true, mcp: true },
  unlimited: { label: 'Illimité', responses: Number.POSITIVE_INFINITY, files: true, mcp: true },
}

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  return `${salt.toString('hex')}:${(await scryptAsync(password, salt, 64)).toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const actual = await scryptAsync(password, Buffer.from(salt, 'hex'), 64)
  const expected = Buffer.from(hash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

/** Change quand le mot de passe change : les sessions ouvertes avant sont refusées. */
export const sessionVersion = (a: Account) => sha256(a.passwordHash).slice(0, 12)

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

export async function getAccount(db: Db, id: string) {
  return db.query.accounts.findFirst({ where: eq(accounts.id, id) })
}

export async function findAccountByEmail(db: Db, email: string) {
  return db.query.accounts.findFirst({ where: eq(accounts.email, normalizeEmail(email)) })
}

export async function createAccount(db: Db, email: string, password: string): Promise<Account> {
  const [row] = await db
    .insert(accounts)
    .values({
      email: normalizeEmail(email),
      passwordHash: await hashPassword(password),
      plan: 'trial',
      trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
    })
    .onConflictDoNothing()
    .returning()
  if (!row) throw new HttpError(409, 'Un compte existe déjà avec cette adresse')
  return row
}

/** Compte et mot de passe valides, sinon `null` (sans dire lequel des deux est faux). */
export async function authenticate(db: Db, email: string, password: string) {
  const account = await findAccountByEmail(db, email)
  if (!account?.passwordHash) return null
  return (await verifyPassword(password, account.passwordHash)) ? account : null
}

export async function setPassword(db: Db, id: string, password: string) {
  await db
    .update(accounts)
    .set({ passwordHash: await hashPassword(password) })
    .where(eq(accounts.id, id))
}

/**
 * Propriétaire de l'instance : le compte OWNER_ID prend ADMIN_EMAIL et ADMIN_PASSWORD à
 * chaque démarrage (créé s'il n'existe pas), en plan illimité.
 */
export async function ensureOwner(db: Db, email: string, password: string) {
  const owner = await getAccount(db, OWNER_ID)
  // Même mot de passe : on garde l'empreinte, sinon chaque redémarrage déconnecterait.
  const passwordHash =
    owner?.passwordHash && (await verifyPassword(password, owner.passwordHash))
      ? owner.passwordHash
      : await hashPassword(password)
  const values = { email: normalizeEmail(email), passwordHash, plan: 'unlimited' as const }
  await db
    .insert(accounts)
    .values({ id: OWNER_ID, ...values })
    .onConflictDoUpdate({ target: accounts.id, set: values })
}

/** Nouveau jeton d'API (remplace l'ancien) ; seule son empreinte est gardée. */
export async function rotateApiToken(db: Db, id: string): Promise<string> {
  const token = `askly_${randomBytes(32).toString('base64url')}`
  await db
    .update(accounts)
    .set({ apiTokenHash: sha256(token) })
    .where(eq(accounts.id, id))
  return token
}

export async function findAccountByApiToken(db: Db, token: string) {
  return db.query.accounts.findFirst({ where: eq(accounts.apiTokenHash, sha256(token)) })
}

/** Abonnement Stripe encore valable (un impayé en cours de relance garde l'accès). */
const PAYING = new Set(['active', 'trialing', 'past_due'])

export function isActive(a: Account, now = new Date()): boolean {
  if (a.plan === 'unlimited') return true
  if (a.plan === 'trial') return Boolean(a.trialEndsAt && a.trialEndsAt > now)
  return PAYING.has(a.subscriptionStatus ?? '')
}

export function assertActive(a: Account) {
  if (!isActive(a)) {
    throw new HttpError(
      402,
      a.plan === 'trial'
        ? 'Votre essai est terminé : choisissez un abonnement dans « Mon compte ».'
        : 'Votre abonnement n’est plus actif : réactivez-le dans « Mon compte ».',
    )
  }
}

export function assertFeature(a: Account, feature: 'files' | 'mcp') {
  if (!PLANS[a.plan][feature]) {
    throw new HttpError(
      402,
      feature === 'files'
        ? 'Les questions « fichier » font partie du plan Pro.'
        : 'Le serveur MCP fait partie du plan Pro.',
    )
  }
}

/** Personnes qui ont commencé un questionnaire de ce compte ce mois-ci. */
export async function monthlyUsage(db: Db, accountId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(respondents)
    .where(
      and(
        eq(respondents.accountId, accountId),
        gte(respondents.startedAt, sql`date_trunc('month', now())`),
      ),
    )
  return row?.n ?? 0
}

/** Un nouveau répondant peut-il commencer ? (compte actif et quota du mois non atteint) */
export async function canStartResponse(db: Db, a: Account): Promise<boolean> {
  return isActive(a) && (await monthlyUsage(db, a.id)) < PLANS[a.plan].responses
}

export async function accountSummary(db: Db, a: Account) {
  return {
    email: a.email,
    plan: a.plan,
    planLabel: PLANS[a.plan].label,
    active: isActive(a),
    trialEndsAt: a.trialEndsAt,
    subscriptionStatus: a.subscriptionStatus,
    hasApiToken: Boolean(a.apiTokenHash),
    usage: await monthlyUsage(db, a.id),
    limit: Number.isFinite(PLANS[a.plan].responses) ? PLANS[a.plan].responses : null,
    features: { files: PLANS[a.plan].files, mcp: PLANS[a.plan].mcp },
  }
}
