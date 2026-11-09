import Anthropic from '@anthropic-ai/sdk'
import { createDb } from '@askly/db'
import { z } from 'zod'
import { ensureOwner, OWNER_ID } from './accounts.ts'
import { buildApp } from './app.ts'
import { seedForms } from './forms.ts'
import { createStorage } from './storage.ts'

const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    ANTHROPIC_API_KEY: z.string().min(1),
    // Propriétaire de l'instance (plan illimité) ; les deux ensemble.
    ADMIN_EMAIL: z.email().optional(),
    ADMIN_PASSWORD: z.string().min(8, 'ADMIN_PASSWORD : 8 caractères minimum').optional(),
    // Clé de signature des sessions et jetons OAuth ; à défaut, dérivée d'ADMIN_PASSWORD.
    SECRET_KEY: z.string().min(32, 'SECRET_KEY : 32 caractères minimum').optional(),
    // SaaS : inscription ouverte et abonnements Stripe (les quatre ensemble).
    SIGNUP: z.stringbool().default(false),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_PRICE_SOLO: z.string().optional(),
    STRIPE_PRICE_PRO: z.string().optional(),
    API_PORT: z.coerce.number().default(3400),
    // 0.0.0.0 dans le conteneur ; en local on reste sur la boucle.
    HOST: z.string().default('127.0.0.1'),
    WEB_DIST: z.string().optional(),
    PUBLIC_URL: z.url().optional(),
    ADMIN_API_TOKEN: z.string().min(32, 'ADMIN_API_TOKEN : 32 caractères minimum').optional(),
    NODE_ENV: z.string().optional(),
    // Stockage S3 : les cinq ensemble, ou aucun (images et fichiers joints désactivés).
    S3_ENDPOINT: z.url().optional(),
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_CREATE_BUCKET: z.stringbool().default(false),
  })
  .parse(process.env)

const secret = env.SECRET_KEY ?? env.ADMIN_PASSWORD
if (!secret) throw new Error('SECRET_KEY (ou ADMIN_PASSWORD) requis')
if (env.ADMIN_EMAIL && !env.ADMIN_PASSWORD) {
  throw new Error('ADMIN_EMAIL et ADMIN_PASSWORD vont ensemble')
}
const stripe = [
  env.STRIPE_SECRET_KEY,
  env.STRIPE_WEBHOOK_SECRET,
  env.STRIPE_PRICE_SOLO,
  env.STRIPE_PRICE_PRO,
]
if (stripe.some(Boolean) && !stripe.every(Boolean)) {
  throw new Error(
    'STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_SOLO et STRIPE_PRICE_PRO vont ensemble',
  )
}
const billing =
  env.STRIPE_SECRET_KEY &&
  env.STRIPE_WEBHOOK_SECRET &&
  env.STRIPE_PRICE_SOLO &&
  env.STRIPE_PRICE_PRO
    ? {
        secretKey: env.STRIPE_SECRET_KEY,
        webhookSecret: env.STRIPE_WEBHOOK_SECRET,
        prices: { solo: env.STRIPE_PRICE_SOLO, pro: env.STRIPE_PRICE_PRO },
      }
    : undefined

const db = createDb(env.DATABASE_URL)

const s3 = [env.S3_ENDPOINT, env.S3_BUCKET, env.S3_ACCESS_KEY_ID, env.S3_SECRET_ACCESS_KEY]
if (s3.some(Boolean) && !s3.every(Boolean)) {
  throw new Error(
    'S3 : S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID et S3_SECRET_ACCESS_KEY vont ensemble',
  )
}
const storage =
  env.S3_ENDPOINT && env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
    ? createStorage({
        endpoint: env.S3_ENDPOINT,
        region: env.S3_REGION,
        bucket: env.S3_BUCKET,
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      })
    : undefined
// En local seulement : le S3 du docker-compose démarre sans bucket.
if (storage && env.S3_CREATE_BUCKET) await storage.ensureBucket()
// Le propriétaire reçoit les YAML de forms/ absents de son compte ; un YAML invalide casse le démarrage.
let seeded = 0
if (env.ADMIN_EMAIL && env.ADMIN_PASSWORD) {
  await ensureOwner(db, env.ADMIN_EMAIL, env.ADMIN_PASSWORD)
  seeded = await seedForms(db, OWNER_ID)
}

const app = buildApp({
  db,
  anthropic: new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }),
  secret,
  signup: env.SIGNUP,
  billing,
  apiToken: env.ADMIN_API_TOKEN,
  publicUrl: env.PUBLIC_URL?.replace(/\/$/, ''),
  webDist: env.WEB_DIST,
  storage,
  // pino-pretty n'est qu'une dépendance de dev : JSON brut en production.
  logger:
    env.NODE_ENV === 'production'
      ? { level: 'info' }
      : { level: 'info', transport: { target: 'pino-pretty' } },
})

await app.listen({ port: env.API_PORT, host: env.HOST })
if (!storage) app.log.warn('S3 non configuré : images et fichiers joints désactivés')
if (seeded > 0) app.log.info(`${seeded} questionnaire(s) importé(s) depuis forms/`)
