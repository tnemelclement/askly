import Anthropic from '@anthropic-ai/sdk'
import { createDb } from '@questionnaire/db'
import { z } from 'zod'
import { buildApp } from './app.ts'
import { listForms } from './forms.ts'

const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    ANTHROPIC_API_KEY: z.string().min(1),
    ADMIN_PASSWORD: z.string().min(8, 'ADMIN_PASSWORD : 8 caractères minimum'),
    API_PORT: z.coerce.number().default(3400),
  })
  .parse(process.env)

// Un YAML invalide doit casser le démarrage, pas la première page qui le lit.
const forms = listForms()

const app = buildApp({
  db: createDb(env.DATABASE_URL),
  anthropic: new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }),
  adminPassword: env.ADMIN_PASSWORD,
  logger: { level: 'info', transport: { target: 'pino-pretty' } },
})

await app.listen({ port: env.API_PORT, host: '127.0.0.1' })
app.log.info(`${forms.length} questionnaire(s) chargé(s) depuis forms/`)
