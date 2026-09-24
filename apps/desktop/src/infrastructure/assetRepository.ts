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

async function videoDimensions(file: Blob) {
  const url = URL.createObjectURL(file)
  try {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.src = url
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        window.clearTimeout(timeout)
        video.onloadedmetadata = null
        video.onerror = null
        error ? reject(error) : resolve()
      }
      const timeout = window.setTimeout(() => finish(new Error('读取 WebM 信息超时，请确认视频使用 WebView2 支持的 VP8/VP9 编码')), 12_000)
      video.onloadedmetadata = () => finish()
      video.onerror = () => finish(new Error('无法读取 WebM，请确认视频编码可由 WebView2 播放'))
      video.load()
    })
    if (!video.videoWidth || !video.videoHeight) throw new Error('WebM 没有有效画面尺寸')
    return { width: video.videoWidth, height: video.videoHeight }
  } finally { URL.revokeObjectURL(url) }
}

function encodeHeaderText(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary)
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
  async importImage(file: File, context: { workId?: string; chapterId?: string; purpose?: Asset['purpose'] } = {}): Promise<Asset> {
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
    return { ...receipt, width, height, workId: context.workId, chapterIds: context.chapterId ? [context.chapterId] : [], purpose: context.purpose ?? 'creative', createdAt: new Date().toISOString() }
  },

  async importCompanionVideo(file: File, onProgress?: (message: string) => void): Promise<Asset> {
    if (file.type !== 'video/webm' && !file.name.toLocaleLowerCase().endsWith('.webm')) throw new Error('动态伙伴仅支持 WebM')
    if (file.size > 200 * 1024 * 1024) throw new Error('WebM 必须小于 200 MB')
    onProgress?.('正在读取视频信息…')
    let width = 0
    let height = 0
    try {
      const dimensions = await videoDimensions(file)
      width = dimensions.width
      height = dimensions.height
    } catch {
      onProgress?.('无法预读画面尺寸，正在继续保存 WebM…')
    }
    onProgress?.('正在读取视频文件…')
    const bytes = new Uint8Array(await file.arrayBuffer())
    let receipt: AssetReceipt
    if (isTauriRuntime()) {
      onProgress?.('正在保存到本地素材库…')
      receipt = await invoke<AssetReceipt>('import_companion_video_asset', bytes, { headers: { 'x-yiyu-file-name': encodeHeaderText(file.name) } })
    } else {
      const id = `asset-${crypto.randomUUID()}`
      browserAssets.set(id, file)
      receipt = { id, fileName: file.name, mimeType: 'video/webm', size: file.size, sha256: `preview-${id}` }
    }
    return { ...receipt, mimeType: 'video/webm', width, height, chapterIds: [], purpose: 'companion', createdAt: new Date().toISOString() }
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
