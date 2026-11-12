/** Image prête pour le chat : réduite, en JPEG base64, avec un aperçu. */
export type StagedImage = { mediaType: 'image/jpeg'; data: string; preview: string }

/** Côté le plus long au-delà duquel l'IA réduit de toute façon l'image. */
const MAX_SIDE = 1568

/** Réduit une photo ou une capture à 1 568 px et la réencode en JPEG (quelques centaines de Ko). */
export async function shrinkImage(file: File): Promise<StagedImage> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Image illisible')
  // Fond blanc : un PNG transparent ne doit pas devenir noir en JPEG.
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const preview = canvas.toDataURL('image/jpeg', 0.85)
  return { mediaType: 'image/jpeg', data: preview.slice(preview.indexOf(',') + 1), preview }
}
