import Anthropic from '@anthropic-ai/sdk'
import { createDb } from '@askly/db'
import { z } from 'zod'
import { buildApp } from './app.ts'
import { seedForms } from './forms.ts'
import { createStorage } from './storage.ts'

const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    ANTHROPIC_API_KEY: z.string().min(1),
    ADMIN_PASSWORD: z.string().min(8, 'ADMIN_PASSWORD : 8 caractères minimum'),
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
// Amorce une base neuve avec les YAML de forms/ ; un YAML invalide casse le démarrage.
const seeded = await seedForms(db)

const app = buildApp({
  db,
  anthropic: new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }),
  adminPassword: env.ADMIN_PASSWORD,
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
