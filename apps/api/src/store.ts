import { answers, type Db, messages, respondents } from '@askly/db'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { Answers, AnswerValue } from './domain.ts'

/** Accès base, regroupés ici pour que les routes et l'IA restent lisibles. */

export type Respondent = typeof respondents.$inferSelect

export async function markSkipped(db: Db, respondentId: string, questionId: string) {
  await db
    .update(respondents)
    .set({
      skipped: sql`array_append(array_remove(${respondents.skipped}, ${questionId}), ${questionId})`,
    })
    .where(eq(respondents.id, respondentId))
}

export async function findRespondentByToken(db: Db, token: string) {
  return db.query.respondents.findFirst({ where: eq(respondents.token, token) })
}

export async function loadAnswers(db: Db, respondentId: string): Promise<Answers> {
  const rows = await db.select().from(answers).where(eq(answers.respondentId, respondentId))
  return Object.fromEntries(rows.map((r) => [r.questionId, r.value]))
}

export async function saveAnswer(
  db: Db,
  respondentId: string,
  questionId: string,
  value: AnswerValue,
  source: 'ai' | 'manual',
) {
  await db
    .insert(answers)
    .values({ respondentId, questionId, value, source })
    .onConflictDoUpdate({
      target: [answers.respondentId, answers.questionId],
      set: { value, source, updatedAt: sql`now()` },
    })
}

export async function loadMessages(db: Db, respondentId: string) {
  return db
    .select()
    .from(messages)
    .where(eq(messages.respondentId, respondentId))
    .orderBy(asc(messages.id))
}

export type NewMessage = Omit<typeof messages.$inferInsert, 'id' | 'createdAt' | 'respondentId'>

/** Ajout groupé : un tour assistant et ses résultats d'outils entrent ensemble ou pas du tout. */
export async function appendMessages(db: Db, respondentId: string, rows: NewMessage[]) {
  await db.insert(messages).values(rows.map((r) => ({ ...r, respondentId })))
}

export async function markStarted(db: Db, respondentId: string) {
  await db
    .update(respondents)
    .set({ startedAt: sql`coalesce(${respondents.startedAt}, now())` })
    .where(eq(respondents.id, respondentId))
}

/** Verrouille ; renvoie `false` si c'était déjà envoyé. */
export async function markSubmitted(db: Db, respondentId: string): Promise<boolean> {
  const rows = await db
    .update(respondents)
    .set({ submittedAt: sql`now()` })
    .where(and(eq(respondents.id, respondentId), sql`${respondents.submittedAt} is null`))
    .returning({ id: respondents.id })
  return rows.length > 0
}
