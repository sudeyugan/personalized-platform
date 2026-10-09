import { experienceCovers, suggestedProvider, type CoverCandidate } from '../../infrastructure/experienceCovers'
import type { CoverProvider, ExperienceCategory } from '../../domain/experiences'
import { rankCovers, type CoverHints } from './coverMatching'
import { useLibraryStore } from '../../state/useLibraryStore'

const searches = new Map<string, { time: number; candidates: CoverCandidate[] }>()
const images = new Map<string, { time: number; file: File }>()
const ttl = 30 * 60 * 1000
export async function automaticCoverProvider(category: ExperienceCategory): Promise<CoverProvider> {
  return suggestedProvider(category)
}
export async function lookupCovers(provider: CoverProvider | 'auto', category: ExperienceCategory, hints: CoverHints) {
  const selected = provider === 'auto' ? await automaticCoverProvider(category) : provider
  const config = selected === 'webnovel' ? useLibraryStore.getState().data.settings.webSearch : undefined
  const key = JSON.stringify([selected, category, hints.title.trim(), hints.creator.trim(), config])
  let saved = searches.get(key)
  // Empty results must not make an explicit second search replay a 30-minute failure.
  const incompleteNovel = selected === 'webnovel' && saved?.candidates.some(candidate => !candidate.coverUrl)
  if (!saved || !saved.candidates.length || incompleteNovel || Date.now() - saved.time >= ttl) {
    const candidates = config ? await experienceCovers.search(selected, category, hints.title, hints.creator, config) : await experienceCovers.search(selected, category, hints.title, hints.creator)
    if (config && config !== useLibraryStore.getState().data.settings.webSearch) throw new Error('搜索服务配置已变化，请重新查找')
    saved = { time: Date.now(), candidates }
    searches.delete(key); searches.set(key, saved)
    while (searches.size > 32) searches.delete(searches.keys().next().value!)
  }
  return rankCovers(saved.candidates, hints)
}
export async function lookupCoverImage(url: string) {
  const cached = images.get(url)
  if (cached && Date.now() - cached.time < ttl) return cached.file
  const file = await experienceCovers.image(url)
  images.delete(url); images.set(url, { time: Date.now(), file })
  while (images.size > 24) images.delete(images.keys().next().value!)
  return file
}
