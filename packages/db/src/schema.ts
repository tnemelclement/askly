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
 * Compte client (SaaS) ou propriétaire de l'instance (auto-hébergé, plan `unlimited`).
 * Tout le reste (questionnaires, répondants, fichiers) appartient à un compte.
 */
export const accounts = pgTable('accounts', {
  id: uuid().primaryKey().default(sql`gen_random_uuid()`),
  /** En minuscules. */
  email: text().notNull().unique(),
  /** scrypt, format `sel:empreinte` en hexadécimal ; vide = connexion impossible. */
  passwordHash: text().notNull(),
  plan: text({ enum: ['trial', 'solo', 'pro', 'unlimited'] })
    .notNull()
    .default('trial'),
  trialEndsAt: timestamp({ withTimezone: true }),
  stripeCustomerId: text().unique(),
  /** Statut Stripe de l'abonnement (active, past_due, canceled…) ; null hors abonnement. */
  subscriptionStatus: text(),
  /** SHA-256 du jeton d'API (serveur MCP depuis Claude Code), jamais le jeton lui-même. */
  apiTokenHash: text().unique(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

const accountId = () =>
  uuid()
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' })

/**
 * Un questionnaire : sa définition (titre, sections, questions) validée par `formSchema` de
 * l'API avant d'entrer ici. Créé par l'API admin (le skill de Claude) ou importé des YAML
 * de `forms/` au démarrage.
 */
export const forms = pgTable(
  'forms',
  {
    accountId: accountId(),
    /** Unique par compte : deux clients peuvent avoir chacun leur « projet-cuisine ». */
    id: text().notNull(),
    definition: jsonb().$type<unknown>().notNull(),
    /** `false` = questionnaire ponctuel, écrit pour une seule personne. */
    reusable: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.id] })],
)

/**
 * Un répondant = une personne invitée à remplir un questionnaire (`forms/<formId>.yaml`),
 * avec son propre lien `/r/<token>`. Statut dérivé : `submittedAt` → terminé,
 * `startedAt` → en cours, sinon pas commencé.
 */
export const respondents = pgTable('respondents', {
  id: uuid().primaryKey().default(sql`gen_random_uuid()`),
  accountId: accountId(),
  token: text().notNull().unique(),
  formId: text().notNull(),
  name: text().notNull(),
  /** Facultatif : le lien s'envoie aussi par WhatsApp. */
  email: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp({ withTimezone: true }),
  submittedAt: timestamp({ withTimezone: true }),
  /** Questions facultatives passées avec « Passer » : ni reposées, ni proposées. */
  skipped: text().array().notNull().default(sql`'{}'::text[]`),
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
    accountId: accountId(),
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
