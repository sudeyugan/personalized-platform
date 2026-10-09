import { invoke } from '@tauri-apps/api/core'
import type { CoverProvider, CoverSource, ExperienceCategory } from '../domain/experiences'
import type { WebSearchConfig } from './webSearch'

export interface CoverCandidate { id: string; provider: CoverProvider; title: string; creator: string; year: string; coverUrl?: string; sourceUrl: string; credit: string; matchedTitle?: string }
export const coverProviderLabels: Record<CoverProvider, string> = { webnovel: '网文平台', weread: '微信读书', bangumi: 'Bangumi', openlibrary: 'Open Library', tmdb: 'TMDB', fanqie: '番茄作品页' }
export const isDesktop = () => '__TAURI_INTERNALS__' in window
function desktopOnly() { if (!isDesktop()) throw new Error('浏览器预览不联网找封面；请在桌面版使用，本地卡片和排行仍可用') }
export function suggestedProvider(category: ExperienceCategory): Exclude<CoverProvider, 'fanqie'> {
  if (category === 'novel') return 'webnovel'
  if (['anime', 'manga', 'game'].includes(category)) return 'bangumi'
  if (['film', 'series'].includes(category)) return 'tmdb'
  return 'openlibrary'
}
export function candidateSource(candidate: CoverCandidate): CoverSource {
  return { provider: candidate.provider, url: candidate.sourceUrl, credit: candidate.credit }
}
export const experienceCovers = {
  async search(provider: CoverProvider, category: ExperienceCategory, query: string, creator = '', catalogSearch?: WebSearchConfig): Promise<CoverCandidate[]> {
    desktopOnly()
    return invoke('experience_cover_search', { provider, category, query: query.trim(), creator: creator.trim(), ...(catalogSearch && provider === 'webnovel' ? { catalogSearch } : {}) })
  },
  async resolveLink(url: string, catalogSearch?: WebSearchConfig): Promise<CoverCandidate> {
    desktopOnly()
    return invoke('experience_cover_link', { url: url.trim(), ...(catalogSearch ? { catalogSearch } : {}) })
  },
  async image(url: string): Promise<File> {
    desktopOnly()
    const response = await invoke<{ mimeType: string; base64: string }>('experience_cover_image', { url })
    const binary = atob(response.base64)
    if (binary.length > 5 * 1024 * 1024) throw new Error('封面超过5MB限制')
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
    return prepareCoverFile(new File([bytes], 'cover', { type: response.mimeType }))
  },
  async hasKey(provider: 'weread' | 'tmdb') {
    return isDesktop() ? invoke<boolean>('has_secret', { id: 'experiences-' + provider }) : false
  },
  async storeKey(provider: 'weread' | 'tmdb', secret: string) {
    desktopOnly()
    const clean = secret.trim()
    if (!clean || clean.length > 4096 || /[\r\n]/.test(clean)) throw new Error('密钥格式不正确')
    await invoke('store_secret', { id: 'experiences-' + provider, secret: clean })
  },
  async deleteKey(provider: 'weread' | 'tmdb') {
    desktopOnly()
    await invoke('delete_secret', { id: 'experiences-' + provider })
  },
}
export async function prepareCoverFile(file: File): Promise<File> {
  if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('请使用5MB以内的JPG、PNG或WebP')
  const image = await createImageBitmap(file)
  try {
    if (image.width * image.height > 16_000_000) throw new Error('封面分辨率过大，请使用较小图片')
    const scale = Math.min(1, 512 / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('无法准备封面画布')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('无法保存封面')), 'image/webp', .86))
    return new File([blob], '经历封面.webp', { type: 'image/webp' })
  } finally { image.close() }
}
