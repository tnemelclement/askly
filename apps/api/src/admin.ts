import { randomBytes } from 'node:crypto'
import { answers, type Db, forms, respondents } from '@askly/db'
import { and, count, desc, eq } from 'drizzle-orm'
import { visibleMessages } from './ai.ts'
import {
  type Answers,
  type AnswerValue,
  allQuestions,
  type Form,
  formatAnswer,
  respondentStatus,
  validateAnswer,
} from './domain.ts'
import { HttpError } from './errors.ts'
import {
  fileInfos,
  fileNames,
  keysOfRespondents,
  respondentFiles,
  saveFileAnswer,
} from './files.ts'
import { getForm, listForms, parseForm, type StoredForm, saveForm } from './forms.ts'
import type { Storage } from './storage.ts'
import { loadAnswers, loadMessages, saveAnswer } from './store.ts'

/**
 * Opérations d'administration, partagées par les routes `/api/admin` (interface, skill) et
 * les outils du serveur MCP : mêmes validations des deux côtés.
 */

export { HttpError }

export async function formOrThrow(db: Db, id: string): Promise<StoredForm> {
  const form = await getForm(db, id)
  if (!form) throw new HttpError(404, `Questionnaire introuvable : ${id}`)
  return form
}

async function respondentOrThrow(db: Db, id: string) {
  const respondent = await db.query.respondents.findFirst({ where: eq(respondents.id, id) })
  if (!respondent) throw new HttpError(404, `Répondant introuvable : ${id}`)
  return respondent
}

export const linkFor = (origin: string, token: string) => `${origin}/r/${token}`

export async function listFormSummaries(db: Db) {
  const rows = await db.select().from(respondents)
  return (await listForms(db)).map((form) => {
    const statuses = rows.filter((r) => r.formId === form.id).map(respondentStatus)
    return {
      id: form.id,
      title: form.title,
      intro: form.intro,
      reusable: form.reusable,
      questionCount: allQuestions(form).length,
      respondents: statuses.length,
      done: statuses.filter((s) => s === 'done').length,
      inProgress: statuses.filter((s) => s === 'in_progress').length,
    }
  })
}

export async function listRespondents(db: Db, form: Form, origin: string) {
  const rows = await db
    .select({ respondent: respondents, answered: count(answers.questionId) })
    .from(respondents)
    .leftJoin(answers, eq(answers.respondentId, respondents.id))
    .where(eq(respondents.formId, form.id))
    .groupBy(respondents.id)
    .orderBy(desc(respondents.createdAt))
  return rows.map(({ respondent, answered }) => ({
    ...respondent,
    status: respondentStatus(respondent),
    answered,
    link: linkFor(origin, respondent.token),
  }))
}

/**
 * Crée ou remplace un questionnaire. `mode` : `create` refuse un id déjà pris, `update` un id
 * inconnu, `upsert` accepte les deux. `definition` : l'objet, ou le même en texte YAML.
 */
export async function putForm(
  db: Db,
  id: string,
  definition: unknown,
  reusable: boolean | undefined,
  mode: 'create' | 'update' | 'upsert',
) {
  const existing = await getForm(db, id)
  if (mode === 'create' && existing) throw new HttpError(409, `Le questionnaire ${id} existe déjà`)
  if (mode === 'update' && !existing) throw new HttpError(404, `Questionnaire introuvable : ${id}`)
  let form: Form
  try {
    form = parseForm(id, definition)
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : 'Questionnaire invalide')
  }
  const { created } = await saveForm(db, form, reusable ?? existing?.reusable ?? true)
  return { id: form.id, created, questionCount: allQuestions(form).length }
}

/** Supprime le questionnaire et ses répondants (réponses et conversations suivent, en cascade). */
export async function deleteForm(db: Db, storage: Storage | undefined, id: string) {
  const form = await formOrThrow(db, id)
  const ids = (
    await db.select({ id: respondents.id }).from(respondents).where(eq(respondents.formId, form.id))
  ).map((r) => r.id)
  const keys = await keysOfRespondents(db, ids)
  const deletedRespondents = await db.transaction(async (tx) => {
    const gone = await tx.delete(respondents).where(eq(respondents.formId, form.id)).returning()
    await tx.delete(forms).where(eq(forms.id, form.id))
    return gone.length
  })
  // Fichiers joints : les lignes sont parties en cascade, on efface les objets S3.
  if (keys.length) await storage?.remove(keys)
  return { id: form.id, deletedRespondents, deletedFiles: keys.length }
}

export async function createRespondent(
  db: Db,
  formId: string,
  input: { name: string; email?: string | undefined },
  origin: string,
) {
  const form = await formOrThrow(db, formId)
  const [created] = await db
    .insert(respondents)
    // 32 octets aléatoires : le lien est le seul secret du répondant.
    .values({ ...input, formId: form.id, token: randomBytes(32).toString('base64url') })
    .returning()
  if (!created) throw new HttpError(500, 'Création impossible')
  return { ...created, status: respondentStatus(created), link: linkFor(origin, created.token) }
}

export async function updateRespondent(
  db: Db,
  id: string,
  input: { name?: string | undefined; email?: string | null | undefined },
  origin: string,
) {
  const current = await respondentOrThrow(db, id)
  const changes = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined))
  const [row] = Object.keys(changes).length
    ? await db.update(respondents).set(changes).where(eq(respondents.id, id)).returning()
    : [current]
  const r = row ?? current
  return { respondentId: r.id, name: r.name, email: r.email, link: linkFor(origin, r.token) }
}

export async function deleteRespondent(db: Db, storage: Storage | undefined, id: string) {
  const r = await respondentOrThrow(db, id)
  const keys = await keysOfRespondents(db, [id])
  await db.delete(respondents).where(eq(respondents.id, id))
  if (keys.length) await storage?.remove(keys)
  return { id, name: r.name, deletedFiles: keys.length }
}

/** Rouvre des réponses envoyées : le répondant peut de nouveau discuter et corriger. */
export async function reopenRespondent(db: Db, id: string) {
  await respondentOrThrow(db, id)
  const [row] = await db
    .update(respondents)
    .set({ submittedAt: null })
    .where(eq(respondents.id, id))
    .returning()
  return { id, status: row ? respondentStatus(row) : 'not_started' }
}

export async function getRespondentDetail(db: Db, id: string, origin: string) {
  const respondent = await respondentOrThrow(db, id)
  const form = await formOrThrow(db, respondent.formId)
  return {
    respondent: {
      ...respondent,
      status: respondentStatus(respondent),
      link: linkFor(origin, respondent.token),
    },
    form,
    answers: await loadAnswers(db, respondent.id),
    files: await fileInfos(db, respondent.id),
    messages: visibleMessages(await loadMessages(db, respondent.id)),
  }
}

/** Corrige (ou efface, `value: null`) une réponse, avec la même validation que le chat. */
export async function setAnswer(
  db: Db,
  storage: Storage | undefined,
  respondentId: string,
  questionId: string,
  value: unknown,
) {
  const respondent = await respondentOrThrow(db, respondentId)
  const form = await formOrThrow(db, respondent.formId)
  const question = allQuestions(form).find((q) => q.id === questionId)
  if (question?.type === 'file') {
    // Pour une question `file`, on ne peut que retirer des fichiers (ou tout effacer avec null).
    const result = value === null ? null : validateAnswer(form, questionId, value)
    if (result && !result.ok) throw new HttpError(400, result.error)
    await saveFileAnswer(
      db,
      storage,
      respondentId,
      questionId,
      result ? (result.value as string[]) : null,
    )
    return { answers: await loadAnswers(db, respondentId) }
  }
  if (value === null) {
    if (!allQuestions(form).some((q) => q.id === questionId)) {
      throw new HttpError(400, `question inconnue : ${questionId}`)
    }
    await db
      .delete(answers)
      .where(and(eq(answers.respondentId, respondentId), eq(answers.questionId, questionId)))
  } else {
    const result = validateAnswer(form, questionId, value)
    if (!result.ok) throw new HttpError(400, result.error)
    await saveAnswer(db, respondentId, questionId, result.value, 'manual')
  }
  return { answers: await loadAnswers(db, respondentId) }
}

/** Réponses de tous les répondants d'un questionnaire (valeurs brutes, clés = id des questions). */
export async function exportAnswers(db: Db, form: Form) {
  const rows = await db.select().from(respondents).where(eq(respondents.formId, form.id))
  const all = (
    await db
      .select({ a: answers })
      .from(answers)
      .innerJoin(respondents, eq(answers.respondentId, respondents.id))
      .where(eq(respondents.formId, form.id))
  ).map((r) => r.a)
  const filesById = await respondentFiles(
    db,
    rows.map((r) => r.id),
  )
  return rows.map((r) => ({
    respondent: r,
    files: filesById,
    status: respondentStatus(r),
    answers: Object.fromEntries(
      all.filter((a) => a.respondentId === r.id).map((a) => [a.questionId, a.value]),
    ) as Answers,
  }))
}

/** Réponses lisibles, question par question, dans l'ordre du questionnaire. */
export function readableAnswers(
  form: Form,
  a: Record<string, AnswerValue>,
  files: Record<string, { filename: string }> = {},
) {
  return allQuestions(form).map((q) => ({
    questionId: q.id,
    label: q.label,
    value: a[q.id] ?? null,
    display: a[q.id] === undefined ? null : formatAnswer(q, a[q.id], fileNames(files)),
  }))
}
