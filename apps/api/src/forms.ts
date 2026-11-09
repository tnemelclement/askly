import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Db } from '@askly/db'
import { forms } from '@askly/db'
import { and, desc, eq, sql } from 'drizzle-orm'
import { parse } from 'yaml'
import { z } from 'zod'
import { FORM_ID, type Form, formSchema } from './domain.ts'

/**
 * Les questionnaires vivent en base (table `forms`). On les crée par l'API admin
 * (`PUT /api/admin/forms/:formId`, utilisée par le skill de Claude) ; les YAML de `forms/`
 * ne servent qu'à amorcer une base neuve, au démarrage.
 */
export const FORMS_DIR = fileURLToPath(new URL('../../../forms', import.meta.url))

/** Valide une définition (objet JSON ou texte YAML) ; lève une erreur lisible. */
export function parseForm(id: string, source: unknown): Form {
  if (!FORM_ID.test(id)) {
    throw new Error(`Identifiant « ${id} » invalide : minuscules, chiffres et tirets (2 à 63)`)
  }
  const result = formSchema.safeParse(typeof source === 'string' ? parse(source) : source)
  if (!result.success) {
    throw new Error(`Questionnaire « ${id} » invalide :\n${z.prettifyError(result.error)}`)
  }
  return { id, ...result.data }
}

export function readFormFiles(dir = FORMS_DIR): Form[] {
  return fs
    .readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .sort()
    .map((f) => parseForm(f.replace(/\.ya?ml$/, ''), fs.readFileSync(path.join(dir, f), 'utf8')))
}

/** Importe les YAML absents du compte ; ne touche jamais un questionnaire déjà en base. */
export async function seedForms(db: Db, accountId: string, dir = FORMS_DIR): Promise<number> {
  const files = readFormFiles(dir)
  if (files.length === 0) return 0
  const rows = await db
    .insert(forms)
    .values(files.map(({ id, ...definition }) => ({ accountId, id, definition })))
    .onConflictDoNothing()
    .returning({ id: forms.id })
  return rows.length
}

export type StoredForm = Form & { reusable: boolean }

export async function saveForm(
  db: Db,
  accountId: string,
  form: Form,
  reusable: boolean,
): Promise<{ created: boolean }> {
  const { id, ...definition } = form
  const [row] = await db
    .insert(forms)
    .values({ accountId, id, definition, reusable })
    .onConflictDoUpdate({
      target: [forms.accountId, forms.id],
      set: { definition, reusable, updatedAt: sql`now()` },
    })
    // `xmax = 0` : la ligne vient d'être insérée, pas mise à jour.
    .returning({ created: sql<boolean>`xmax = 0` })
  return { created: Boolean(row?.created) }
}

// Revalidé à la lecture : le format a pu évoluer depuis l'écriture.
export async function listForms(db: Db, accountId: string): Promise<StoredForm[]> {
  const rows = await db
    .select()
    .from(forms)
    .where(eq(forms.accountId, accountId))
    .orderBy(desc(forms.updatedAt))
  return rows.map((r) => ({ ...parseForm(r.id, r.definition), reusable: r.reusable }))
}

export async function getForm(
  db: Db,
  accountId: string,
  id: string,
): Promise<StoredForm | undefined> {
  const row = await db.query.forms.findFirst({
    where: and(eq(forms.accountId, accountId), eq(forms.id, id)),
  })
  return row && { ...parseForm(row.id, row.definition), reusable: row.reusable }
}
