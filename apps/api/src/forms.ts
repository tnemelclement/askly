import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { z } from 'zod'
import { type Form, formSchema } from './domain.ts'

/** Les questionnaires vivent dans `forms/*.yaml` à la racine du dépôt ; l'id = le nom du fichier. */
export const FORMS_DIR = fileURLToPath(new URL('../../../forms', import.meta.url))

/** Parse et valide un YAML ; lève une erreur lisible qui nomme le fichier. */
export function parseForm(id: string, source: string): Form {
  const result = formSchema.safeParse(parse(source))
  if (!result.success) {
    throw new Error(`Questionnaire « ${id} » invalide :\n${z.prettifyError(result.error)}`)
  }
  return { id, ...result.data }
}

// Relu à chaque appel : on peut éditer un YAML sans redémarrer l'API.
export function listForms(dir = FORMS_DIR): Form[] {
  return fs
    .readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .sort()
    .map((f) => parseForm(f.replace(/\.ya?ml$/, ''), fs.readFileSync(path.join(dir, f), 'utf8')))
}

export function getForm(id: string): Form | undefined {
  return listForms().find((f) => f.id === id)
}
