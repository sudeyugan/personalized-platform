export const experienceCategories = ['novel', 'anime', 'manga', 'book', 'film', 'series', 'game', 'other', 'place'] as const
export type ExperienceCategory = typeof experienceCategories[number]
export const categoryLabels: Record<ExperienceCategory, string> = { novel: '中文网文', anime: '动漫', manga: '漫画', book: '书籍', film: '电影', series: '剧集', game: '游戏', other: '其他作品', place: '足迹' }
export const tierIds = ['top', 'great', 'good', 'ordinary', 'poor'] as const
export type ExperienceTier = typeof tierIds[number]
export type PaperStyle = 'linen' | 'ink' | 'blue' | 'rose'
export type CoverProvider = 'webnovel' | 'weread' | 'bangumi' | 'openlibrary' | 'tmdb' | 'fanqie'
export interface CoverSource { provider: CoverProvider; url: string; credit: string }
export interface ExperienceEntry {
  id: string
  category: ExperienceCategory
  title: string
  creator: string
  dateText: string
  note: string
  paperStyle: PaperStyle
  tier?: ExperienceTier
  order: number
  coverAssetId?: string
  source?: CoverSource
  createdAt: string
  updatedAt: string
  deletedAt?: string
}
export interface ExperienceData { entries: ExperienceEntry[]; tierLabels: Record<ExperienceTier, string> }
export type ExperienceDraft = Omit<ExperienceEntry, 'id' | 'order' | 'createdAt' | 'updatedAt' | 'deletedAt'>
export const defaultTierLabels: ExperienceData['tierLabels'] = { top: '夯', great: '顶级', good: '人上人', ordinary: 'NPC', poor: '拉完了' }
export function emptyExperiences(): ExperienceData { return { entries: [], tierLabels: { ...defaultTierLabels } } }
export function experienceGroup(category: ExperienceCategory) { return category === 'place' ? 'places' : 'works' }
export function safeSourceUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2048) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.port ? url.href : undefined
  } catch { return undefined }
}
const text = (value: unknown, limit: number) => typeof value === 'string' ? value.slice(0, limit).trim() : ''
export function normalizeExperiences(value: unknown): ExperienceData {
  const empty = emptyExperiences()
  if (!value || typeof value !== 'object') return empty
  const data = value as Partial<ExperienceData>
  tierIds.forEach(id => { empty.tierLabels[id] = text(data.tierLabels?.[id], 12) || defaultTierLabels[id] })
  const seen = new Set<string>()
  empty.entries = (Array.isArray(data.entries) ? data.entries : []).flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object' || !text(entry.id, 100) || seen.has(entry.id) || !text(entry.title, 160) || !experienceCategories.includes(entry.category)) return []
    seen.add(entry.id)
    const sourceUrl = safeSourceUrl(entry.source?.url)
    const provider = entry.source?.provider
    return [{
      id: text(entry.id, 100), category: entry.category, title: text(entry.title, 160), creator: text(entry.creator, 100),
      dateText: text(entry.dateText, 80), note: text(entry.note, 10000), paperStyle: ['linen', 'ink', 'blue', 'rose'].includes(entry.paperStyle) ? entry.paperStyle : 'linen' as const,
      tier: tierIds.includes(entry.tier as ExperienceTier) ? entry.tier : undefined,
      order: Number.isFinite(entry.order) ? entry.order : index, coverAssetId: /^asset-[a-zA-Z0-9-]+$/.test(entry.coverAssetId ?? '') ? entry.coverAssetId : undefined,
      source: sourceUrl && provider && ['webnovel', 'weread', 'bangumi', 'openlibrary', 'tmdb', 'fanqie'].includes(provider) ? { provider, url: sourceUrl, credit: text(entry.source?.credit, 180) } : undefined,
      createdAt: text(entry.createdAt, 40), updatedAt: text(entry.updatedAt, 40), deletedAt: text(entry.deletedAt, 40) || undefined,
    }]
  })
  return empty
}
export function rankExperience(entries: ExperienceEntry[], id: string, tier: ExperienceTier | undefined, beforeId?: string): ExperienceEntry[] {
  const entry = entries.find(item => item.id === id && !item.deletedAt)
  if (!entry || (tier !== undefined && !tierIds.includes(tier))) return entries
  const siblings = entries.filter(item => item.id !== id && !item.deletedAt && item.tier === tier && experienceGroup(item.category) === experienceGroup(entry.category)).sort((a, b) => a.order - b.order)
  const before = siblings.findIndex(item => item.id === beforeId)
  siblings.splice(before < 0 ? siblings.length : before, 0, { ...entry, tier })
  const ranked = new Map(siblings.map((item, index) => [item.id, { ...item, order: index }]))
  return entries.map(item => ranked.has(item.id) ? { ...ranked.get(item.id)!, updatedAt: new Date().toISOString() } : item)
}
