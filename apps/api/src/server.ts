import Anthropic from '@anthropic-ai/sdk'
import { createDb } from '@questionnaire/db'
import { z } from 'zod'
import { buildApp } from './app.ts'
import { seedForms } from './forms.ts'

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
  })
  .parse(process.env)

const db = createDb(env.DATABASE_URL)
// Amorce une base neuve avec les YAML de forms/ ; un YAML invalide casse le démarrage.
const seeded = await seedForms(db)

const app = buildApp({
  db,
  anthropic: new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }),
  adminPassword: env.ADMIN_PASSWORD,
  apiToken: env.ADMIN_API_TOKEN,
  publicUrl: env.PUBLIC_URL?.replace(/\/$/, ''),
  webDist: env.WEB_DIST,
  // pino-pretty n'est qu'une dépendance de dev : JSON brut en production.
  logger:
    env.NODE_ENV === 'production'
      ? { level: 'info' }
      : { level: 'info', transport: { target: 'pino-pretty' } },
})

await app.listen({ port: env.API_PORT, host: env.HOST })
if (seeded > 0) app.log.info(`${seeded} questionnaire(s) importé(s) depuis forms/`)
