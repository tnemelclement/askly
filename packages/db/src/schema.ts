import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

/**
 * Un questionnaire : sa définition (titre, sections, questions) validée par `formSchema` de
 * l'API avant d'entrer ici. Créé par l'API admin (le skill de Claude) ou importé des YAML
 * de `forms/` au démarrage.
 */
export const forms = pgTable('forms', {
  id: text().primaryKey(),
  definition: jsonb().$type<unknown>().notNull(),
  /** `false` = questionnaire ponctuel, écrit pour une seule personne. */
  reusable: boolean().notNull().default(true),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

/**
 * Un répondant = une personne invitée à remplir un questionnaire (`forms/<formId>.yaml`),
 * avec son propre lien `/r/<token>`. Statut dérivé : `submittedAt` → terminé,
 * `startedAt` → en cours, sinon pas commencé.
 */
export const respondents = pgTable('respondents', {
  id: uuid().primaryKey().default(sql`gen_random_uuid()`),
  token: text().notNull().unique(),
  formId: text().notNull(),
  name: text().notNull(),
  /** Facultatif : le lien s'envoie aussi par WhatsApp. */
  email: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp({ withTimezone: true }),
  submittedAt: timestamp({ withTimezone: true }),
})

/** Réponse validée à une question ; `source` dit si elle vient de l'IA ou d'une correction. */
export const answers = pgTable(
  'answers',
  {
    respondentId: uuid()
      .notNull()
      .references(() => respondents.id, { onDelete: 'cascade' }),
    questionId: text().notNull(),
    value: jsonb().$type<string | number | boolean | string[]>().notNull(),
    source: text({ enum: ['ai', 'manual'] }).notNull(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.respondentId, t.questionId] })],
)

/**
 * Historique de la conversation, en ajout seul. `content` = blocs de l'API Anthropic tels
 * quels (thinking, tool_use, tool_result compris) pour rejouer l'échange à l'identique ;
 * `display` = texte montré au répondant, `null` pour un message technique.
 */
export const messages = pgTable(
  'messages',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    respondentId: uuid()
      .notNull()
      .references(() => respondents.id, { onDelete: 'cascade' }),
    role: text({ enum: ['user', 'assistant'] }).notNull(),
    content: jsonb().$type<unknown[]>().notNull(),
    display: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.respondentId, t.id)],
)

/**
 * Fichier stocké sur S3 : image d'un questionnaire (`image`, envoyée par l'admin ou le MCP)
 * ou fichier joint par un répondant à une question de type `file` (`upload`). La réponse
 * à cette question contient les id des fichiers.
 */
export const files = pgTable(
  'files',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    kind: text({ enum: ['image', 'upload'] }).notNull(),
    respondentId: uuid().references(() => respondents.id, { onDelete: 'cascade' }),
    questionId: text(),
    key: text().notNull(),
    filename: text().notNull(),
    contentType: text().notNull(),
    size: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.respondentId)],
)
