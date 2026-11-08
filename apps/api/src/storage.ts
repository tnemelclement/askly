import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

/**
 * Stockage S3 des images et des fichiers joints. Bucket privé : on ne sert que des liens
 * signés, de courte durée, après avoir vérifié qui demande.
 */

export interface StorageConfig {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
}

export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>
  /** Lien de téléchargement signé ; `filename` donne le nom du fichier enregistré. */
  signedUrl(
    key: string,
    filename: string,
    opts?: { inline?: boolean; ttl?: number },
  ): Promise<string>
  read(key: string): Promise<Buffer>
  remove(keys: string[]): Promise<void>
  ensureBucket(): Promise<void>
}

export function createStorage(config: StorageConfig): Storage {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // Adresses en chemin (endpoint/bucket/clé) : comprises par OVH, Scaleway, RustFS…
    forcePathStyle: true,
  })
  const Bucket = config.bucket
  return {
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }),
      )
    },
    async signedUrl(key, filename, opts = {}) {
      const disposition = `${opts.inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(filename)}`
      return getSignedUrl(
        client,
        new GetObjectCommand({ Bucket, Key: key, ResponseContentDisposition: disposition }),
        { expiresIn: opts.ttl ?? 3600 },
      )
    },
    async read(key) {
      const res = await client.send(new GetObjectCommand({ Bucket, Key: key }))
      if (!res.Body) throw new Error(`Objet vide : ${key}`)
      return Buffer.from(await res.Body.transformToByteArray())
    },
    async remove(keys) {
      // Par paquets de 1 000, la limite de l'API.
      for (let i = 0; i < keys.length; i += 1000) {
        await client.send(
          new DeleteObjectsCommand({
            Bucket,
            Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })) },
          }),
        )
      }
    },
    async ensureBucket() {
      try {
        await client.send(new HeadBucketCommand({ Bucket }))
      } catch {
        await client.send(new CreateBucketCommand({ Bucket }))
      }
    },
  }
}

/** Formats acceptés pour les fichiers joints : images, PDF, documents bureautiques, texte. */
export const ALLOWED_UPLOAD_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/zip',
])

export const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

/** Nom de fichier sûr pour une clé S3 (le nom d'origine reste en base). */
export function safeName(filename: string): string {
  const cleaned = filename
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(-100)
  return cleaned || 'fichier'
}
