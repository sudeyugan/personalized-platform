import { invoke } from '@tauri-apps/api/core'
import type { Asset } from '../domain/models'

interface AssetReceipt { id: string; fileName: string; mimeType: string; size: number; sha256: string }
const browserAssets = new Map<string, Blob>()
const unlockedAssets = new Map<string, Blob>()
const isTauriRuntime = () => '__TAURI_INTERNALS__' in window

async function dimensions(file: Blob) {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return { width: image.naturalWidth, height: image.naturalHeight, image }
  } finally { URL.revokeObjectURL(url) }
}

async function thumbnailBytes(file: Blob) {
  const source = await createImageBitmap(file)
  const scale = Math.min(1, 512 / Math.max(source.width, source.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(source.width * scale))
  canvas.height = Math.max(1, Math.round(source.height * scale))
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height)
  source.close()
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('无法生成缩略图')), 'image/webp', .82))
  return [...new Uint8Array(await blob.arrayBuffer())]
}

export const assetRepository = {
  async importImage(file: File, context: { workId?: string; chapterId?: string } = {}): Promise<Asset> {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('仅支持 JPG、PNG 和 WebP 图片')
    if (file.size > 25 * 1024 * 1024) throw new Error('图片必须小于 25 MB')
    const { width, height } = await dimensions(file)
    const bytes = [...new Uint8Array(await file.arrayBuffer())]
    let receipt: AssetReceipt
    if (isTauriRuntime()) receipt = await invoke<AssetReceipt>('import_image_asset', { fileName: file.name, mimeType: file.type, bytes, thumbnail: await thumbnailBytes(file) })
    else {
      const id = `asset-${crypto.randomUUID()}`
      browserAssets.set(id, file)
      receipt = { id, fileName: file.name, mimeType: file.type, size: file.size, sha256: `preview-${id}` }
    }
    return { ...receipt, width, height, workId: context.workId, chapterIds: context.chapterId ? [context.chapterId] : [], createdAt: new Date().toISOString() }
  },

  async readUrl(asset: Pick<Asset, 'id' | 'mimeType'>, thumbnail = false) {
    const blob = new Blob([await this.readBytes(asset, thumbnail)], { type: thumbnail ? 'image/webp' : asset.mimeType })
    if (!blob) throw new Error('找不到素材文件')
    return URL.createObjectURL(blob)
  },

  async readBytes(asset: Pick<Asset, 'id' | 'mimeType'>, thumbnail = false) {
    const unlocked = unlockedAssets.get(asset.id); if (unlocked) return new Uint8Array(await unlocked.arrayBuffer())
    if (isTauriRuntime()) return new Uint8Array(await invoke<number[]>('read_image_asset', { id: asset.id, mimeType: asset.mimeType, thumbnail }))
    const blob = browserAssets.get(asset.id); if (!blob) throw new Error('找不到素材文件')
    return new Uint8Array(await blob.arrayBuffer())
  },

  async delete(asset: Pick<Asset, 'id' | 'mimeType'>) {
    if (isTauriRuntime()) await invoke('delete_image_asset', { id: asset.id, mimeType: asset.mimeType })
    else browserAssets.delete(asset.id)
    unlockedAssets.delete(asset.id)
  },
  registerUnlocked(id: string, mimeType: string, bytes: number[]) { unlockedAssets.set(id, new Blob([new Uint8Array(bytes)], { type: mimeType })) },
  clearUnlocked(ids: string[]) { ids.forEach((id) => unlockedAssets.delete(id)) },
  async deletePlainFile(asset: Pick<Asset, 'id' | 'mimeType'>) { if (isTauriRuntime()) await invoke('delete_image_asset', { id: asset.id, mimeType: asset.mimeType }); else browserAssets.delete(asset.id) },
}
