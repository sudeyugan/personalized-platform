import type { CoverCandidate } from '../../infrastructure/experienceCovers'
export interface CoverHints { title: string; creator: string; year: string }
const normalized = (text: string) => text.normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}]/gu, '')
export function coverMatch(candidate: CoverCandidate, hints: CoverHints) {
  const title = normalized(hints.title), name = normalized(candidate.title)
  const creator = normalized(hints.creator), author = normalized(candidate.creator)
  const exact = title !== '' && title === name
  const authorMatch = creator !== '' && author.includes(creator)
  const yearMatch = hints.year !== '' && hints.year === candidate.year
  const score = (exact ? 20 : name.includes(title) && title ? 8 : 0) + (authorMatch ? 12 : creator && author ? -12 : 0) + (yearMatch ? 8 : hints.year && candidate.year ? -8 : 0)
  const label = [exact ? '名称相同' : '请核对名称', creator ? authorMatch ? '作者匹配' : '请核对作者' : '', hints.year ? yearMatch ? '年份匹配' : '请核对年份' : ''].filter(Boolean).join(' · ')
  return { score, label }
}
export function rankCovers(candidates: CoverCandidate[], hints: CoverHints) {
  return [...candidates].sort((a, b) => coverMatch(b, hints).score - coverMatch(a, hints).score)
}
