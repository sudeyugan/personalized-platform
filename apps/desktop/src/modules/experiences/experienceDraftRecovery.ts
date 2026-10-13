import { experienceCategories, safeSourceUrl, tierIds, type ExperienceDraft } from '../../domain/experiences'

export interface RecoverableExperienceDraft { key: string; draft: ExperienceDraft; updatedAt: string; originalUpdatedAt?: string; coverNeedsReselect: boolean }
interface RecoveryData { version: 1; enabled: boolean; drafts: RecoverableExperienceDraft[] }
const empty = (): RecoveryData => ({ version: 1, enabled: false, drafts: [] })
const keyFor = (scope: string) => `yiyu:experience-draft:v1:${encodeURIComponent(scope)}`
const text = (value: unknown, limit: number) => typeof value === 'string' ? value.slice(0, limit) : ''
function normalizeDraft(value: unknown): ExperienceDraft | undefined {
  if (!value || typeof value !== 'object') return
  const input = value as ExperienceDraft
  if (!experienceCategories.includes(input.category)) return
  const url = safeSourceUrl(input.source?.url)
  return { category: input.category, title: text(input.title, 160), creator: text(input.creator, 100), note: text(input.note, 10000), dateText: text(input.dateText, 80),
    paperStyle: ['linen', 'ink', 'blue', 'rose'].includes(input.paperStyle) ? input.paperStyle : 'linen',
    tier: tierIds.includes(input.tier!) ? input.tier : undefined,
    coverAssetId: /^asset-[a-zA-Z0-9-]+$/.test(input.coverAssetId ?? '') ? input.coverAssetId : undefined,
    source: url && input.source && ['webnovel', 'weread', 'bangumi', 'openlibrary', 'tmdb', 'fanqie'].includes(input.source.provider) ? { provider: input.source.provider, url, credit: text(input.source.credit, 180) } : undefined }
}
export function readExperienceRecovery(scope: string): RecoveryData {
  const raw = window.localStorage.getItem(keyFor(scope))
  if (!raw) return empty()
  if (raw.length > 200000) throw new Error('文字草稿过大，未读取；可关闭恢复来清除。')
  let value: RecoveryData
  try { value = JSON.parse(raw) } catch { throw new Error('文字草稿无法读取；可关闭恢复来清除。') }
  if (value?.version !== 1 || value.enabled !== true || !Array.isArray(value.drafts)) return empty()
  return { version: 1, enabled: true, drafts: value.drafts.slice(0, 6).flatMap(item => {
    const draft = normalizeDraft(item?.draft)
    return draft && typeof item.key === 'string' && item.key.length <= 120 && typeof item.updatedAt === 'string'
      ? [{ key: item.key, draft, updatedAt: item.updatedAt, originalUpdatedAt: text(item.originalUpdatedAt, 40) || undefined, coverNeedsReselect: item.coverNeedsReselect === true }] : []
  }) }
}
export function setExperienceRecovery(scope: string, enabled: boolean) {
  if (!enabled) { window.localStorage.removeItem(keyFor(scope)); return }
  window.localStorage.setItem(keyFor(scope), JSON.stringify({ ...readExperienceRecovery(scope), enabled: true }))
}
export function saveExperienceRecovery(scope: string, entry: RecoverableExperienceDraft) {
  const current = readExperienceRecovery(scope)
  if (!current.enabled) return
  const draft = normalizeDraft(entry.draft)
  if (!draft) return
  // An unpersisted image cannot carry a restored cover attribution.
  const restored = entry.coverNeedsReselect ? { ...draft, source: undefined, coverAssetId: undefined } : draft
  const drafts = [{ ...entry, draft: restored }, ...current.drafts.filter(item => item.key !== entry.key)].slice(0, 6)
  window.localStorage.setItem(keyFor(scope), JSON.stringify({ version: 1, enabled: true, drafts }))
}
export function removeExperienceRecovery(scope: string, key: string) {
  const current = readExperienceRecovery(scope)
  if (current.enabled) window.localStorage.setItem(keyFor(scope), JSON.stringify({ ...current, drafts: current.drafts.filter(item => item.key !== key) }))
}
