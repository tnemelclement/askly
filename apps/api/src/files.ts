import { randomUUID } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { answers, type Db, files } from '@askly/db'
import { and, eq, inArray } from 'drizzle-orm'
import {
  type AnswerValue,
  allQuestions,
  type Form,
  MAX_FILE_SIZE,
  MAX_FILES_PER_QUESTION,
} from './domain.ts'
import { HttpError } from './errors.ts'
import { ALLOWED_UPLOAD_TYPES, IMAGE_TYPES, type Storage, safeName } from './storage.ts'
import { loadAnswers, saveAnswer } from './store.ts'

/**
 * Fichiers sur S3 : images des questionnaires et fichiers joints par les répondants. La
 * réponse à une question `file` contient les id des fichiers ; ce module garantit qu'elle ne
 * cite que des fichiers de ce répondant, pour cette question, et efface ceux qu'on retire.
 */

export type FileRow = typeof files.$inferSelect
export type FileInfo = { id: string; filename: string; contentType: string; size: number }

export function requireStorage(storage: Storage | undefined): Storage {
  if (!storage) throw new HttpError(503, 'Stockage des fichiers non configuré (S3_*)')
  return storage
}

const info = (f: FileRow): FileInfo => ({
  id: f.id,
  filename: f.filename,
  contentType: f.contentType,
  size: f.size,
})

/** Fichiers joints d'un ou plusieurs répondants, par id. */
export async function respondentFiles(db: Db, respondentIds: string[]) {
  if (respondentIds.length === 0) return {} as Record<string, FileRow>
  const rows = await db.select().from(files).where(inArray(files.respondentId, respondentIds))
  return Object.fromEntries(rows.map((f) => [f.id, f]))
}

export async function fileInfos(db: Db, respondentId: string): Promise<Record<string, FileInfo>> {
  const rows = await respondentFiles(db, [respondentId])
  return Object.fromEntries(Object.entries(rows).map(([id, f]) => [id, info(f)]))
}

export const fileNames = (rows: Record<string, { filename: string }>) =>
  Object.fromEntries(Object.entries(rows).map(([id, f]) => [id, f.filename]))

/**
 * Enregistre la réponse d'une question `file` après validation des id : ils doivent tous
 * être des fichiers de ce répondant pour cette question. Les fichiers retirés sont effacés.
 */
export async function saveFileAnswer(
  db: Db,
  storage: Storage | undefined,
  respondentId: string,
  questionId: string,
  ids: string[] | null,
) {
  const mine = await db
    .select()
    .from(files)
    .where(and(eq(files.respondentId, respondentId), eq(files.questionId, questionId)))
  const known = new Set(mine.map((f) => f.id))
  const unknown = (ids ?? []).filter((id) => !known.has(id))
  if (unknown.length) throw new HttpError(400, `fichiers inconnus : ${unknown.join(', ')}`)
  const removed = mine.filter((f) => !(ids ?? []).includes(f.id))
  if (ids && ids.length > 0) {
    await saveAnswer(db, respondentId, questionId, ids, 'manual')
  } else {
    await db
      .delete(answers)
      .where(and(eq(answers.respondentId, respondentId), eq(answers.questionId, questionId)))
  }
  await deleteFiles(db, storage, removed)
}

export async function deleteFiles(db: Db, storage: Storage | undefined, rows: FileRow[]) {
  if (rows.length === 0) return
  await db.delete(files).where(
    inArray(
      files.id,
      rows.map((f) => f.id),
    ),
  )
  // Après la base : un objet orphelin sur S3 vaut mieux qu'une réponse qui cite un fichier disparu.
  await storage?.remove(rows.map((f) => f.key))
}

/** Clés S3 des fichiers de répondants, à effacer avant de supprimer ces répondants. */
export async function keysOfRespondents(db: Db, respondentIds: string[]) {
  return Object.values(await respondentFiles(db, respondentIds)).map((f) => f.key)
}

export interface Upload {
  filename: string
  contentType: string
  body: Buffer
}

function checkUpload(u: Upload, allowed: Set<string>) {
  if (u.body.length === 0) throw new HttpError(400, 'Fichier vide')
  if (u.body.length > MAX_FILE_SIZE) {
    throw new HttpError(413, `Fichier trop lourd (${MAX_FILE_SIZE / 1024 / 1024} Mo maximum)`)
  }
  if (!allowed.has(u.contentType)) {
    throw new HttpError(415, `Format non accepté : ${u.contentType || 'inconnu'}`)
  }
}

/** Fichier joint par un répondant à une question `file` : stocké, puis ajouté à sa réponse. */
export async function addRespondentFile(
  db: Db,
  storage: Storage | undefined,
  form: Form,
  respondent: { id: string; accountId: string },
  questionId: string,
  upload: Upload,
) {
  const s3 = requireStorage(storage)
  const question = allQuestions(form).find((q) => q.id === questionId)
  if (question?.type !== 'file') throw new HttpError(400, `${questionId} n'attend pas de fichier`)
  checkUpload(upload, ALLOWED_UPLOAD_TYPES)
  const respondentId = respondent.id
  const current = (await loadAnswers(db, respondentId))[questionId]
  const ids = Array.isArray(current) ? current : []
  if (ids.length >= MAX_FILES_PER_QUESTION) {
    throw new HttpError(400, `${MAX_FILES_PER_QUESTION} fichiers maximum pour cette question`)
  }
  const key = `uploads/${respondentId}/${randomUUID()}-${safeName(upload.filename)}`
  await s3.put(key, upload.body, upload.contentType)
  const [row] = await db
    .insert(files)
    .values({
      kind: 'upload',
      accountId: respondent.accountId,
      respondentId,
      questionId,
      key,
      filename: upload.filename.slice(0, 255),
      contentType: upload.contentType,
      size: upload.body.length,
    })
    .returning()
  if (!row) throw new HttpError(500, 'Enregistrement impossible')
  await saveAnswer(db, respondentId, questionId, [...ids, row.id] as AnswerValue, 'manual')
  return info(row)
}

/** Image de questionnaire ; renvoie l'adresse publique à mettre dans `image.url`. */
export async function addImage(
  db: Db,
  storage: Storage | undefined,
  accountId: string,
  upload: Upload,
  origin: string,
) {
  const s3 = requireStorage(storage)
  checkUpload(upload, IMAGE_TYPES)
  const key = `images/${randomUUID()}-${safeName(upload.filename)}`
  await s3.put(key, upload.body, upload.contentType)
  const [row] = await db
    .insert(files)
    .values({
      kind: 'image',
      accountId,
      key,
      filename: upload.filename.slice(0, 255),
      contentType: upload.contentType,
      size: upload.body.length,
    })
    .returning()
  if (!row) throw new HttpError(500, 'Enregistrement impossible')
  return { ...info(row), url: `${origin}/api/images/${row.id}` }
}

/** Fichier par id ; avec `accountId`, seulement s'il appartient à ce compte. */
export async function findFile(db: Db, id: string, accountId?: string) {
  const row = await db.query.files.findFirst({
    where: accountId ? and(eq(files.id, id), eq(files.accountId, accountId)) : eq(files.id, id),
  })
  if (!row) throw new HttpError(404, 'Fichier introuvable')
  return row
}

/** Adresse privée, de boucle locale ou de lien local : jamais atteinte depuis le serveur. */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a = 0, b = 0] = ip.split('.').map(Number)
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    )
  }
  const v6 = ip.toLowerCase()
  if (v6.startsWith('::ffff:')) return isPrivateAddress(v6.slice(7))
  return v6 === '::' || v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6)
}

/**
 * Télécharge une image en ligne pour la stocker chez nous. Contre la falsification de
 * requêtes (SSRF) : https seulement, chaque hôte (redirections comprises) doit résoudre vers
 * une adresse publique.
 * shortcut: l'adresse est vérifiée puis fetch la résout à nouveau (fenêtre de rebinding DNS) ; épingler l'IP résolue via un agent undici si l'outil sert à d'autres que l'admin.
 */
export async function fetchImage(url: string): Promise<Upload> {
  let current = new URL(url)
  for (let hop = 0; hop < 4; hop++) {
    if (current.protocol !== 'https:') throw new HttpError(400, 'Adresse https:// attendue')
    const addresses = await lookup(current.hostname, { all: true }).catch(() => [])
    if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
      throw new HttpError(400, `Hôte non autorisé : ${current.hostname}`)
    }
    const res = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(15_000) })
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location') as string, current)
      continue
    }
    if (!res.ok) throw new HttpError(400, `Téléchargement impossible (${res.status})`)
    const declared = Number(res.headers.get('content-length') ?? 0)
    if (declared > MAX_FILE_SIZE) throw new HttpError(413, 'Image trop lourde')
    const body = Buffer.from(await res.arrayBuffer())
    const contentType = (res.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? ''
    const filename = decodeURIComponent(current.pathname.split('/').pop() || 'image')
    return { filename, contentType, body }
  }
  throw new HttpError(400, 'Trop de redirections')
}
