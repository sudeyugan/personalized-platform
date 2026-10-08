import { experienceCovers, suggestedProvider, type CoverCandidate } from '../../infrastructure/experienceCovers'
import type { CoverProvider, ExperienceCategory } from '../../domain/experiences'
import { rankCovers, type CoverHints } from './coverMatching'

const searches = new Map<string, { time: number; candidates: CoverCandidate[] }>()
const images = new Map<string, { time: number; file: File }>()
const ttl = 30 * 60 * 1000
export async function automaticCoverProvider(category: ExperienceCategory): Promise<CoverProvider> {
  const suggested = suggestedProvider(category)
  if (suggested === 'weread' && !await experienceCovers.hasKey('weread')) return 'openlibrary'
  // Do not silently query an unrelated catalogue for films that require TMDB credentials.
  return suggested
}
export async function lookupCovers(provider: CoverProvider | 'auto', category: ExperienceCategory, hints: CoverHints) {
  const selected = provider === 'auto' ? await automaticCoverProvider(category) : provider
  const key = JSON.stringify([selected, category, hints.title.trim(), hints.creator.trim()])
  let saved = searches.get(key)
  // Empty results must not make an explicit second search replay a 30-minute failure.
  if (!saved || !saved.candidates.length || Date.now() - saved.time >= ttl) {
    saved = { time: Date.now(), candidates: await experienceCovers.search(selected, category, hints.title, hints.creator) }
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
