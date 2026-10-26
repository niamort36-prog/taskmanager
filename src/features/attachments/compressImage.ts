/**
 * Réduit une photo avant envoi : 1920 px maximum, JPEG qualité 0,82.
 * Une photo de téléphone (4 à 8 Mo) passe à quelques centaines de Ko :
 * envoi plus rapide en 4G et stockage gratuit préservé.
 * L'orientation (EXIF) est respectée. En cas de problème, l'original est gardé.
 */
const MAX_SIDE = 1920
const QUALITY = 0.82

export async function compressImage(file: File): Promise<File> {
  // GIF animés, SVG et petits fichiers : inchangés.
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) || file.size < 300 * 1024) return file
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', QUALITY))
    if (!blob || blob.size >= file.size) return file
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified })
  } catch {
    return file
  }
}
