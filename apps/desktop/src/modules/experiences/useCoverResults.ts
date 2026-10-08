import { useEffect, useRef, useState } from 'react'
import type { ExperienceCategory, CoverProvider } from '../../domain/experiences'
import { experienceCovers, type CoverCandidate } from '../../infrastructure/experienceCovers'
import { lookupCovers, lookupCoverImage } from './coverLookup'
import type { CoverHints } from './coverMatching'

export interface CoverResult { candidate: CoverCandidate; file?: File; imagePending: boolean; imageError?: string }
export function useCoverResults() {
  const [results, setResults] = useState<CoverResult[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const generation = useRef(0)
  useEffect(() => () => { generation.current++ }, [])
  const run = async (request: () => Promise<CoverCandidate[]>) => {
    const current = ++generation.current
    setLoading(true); setMessage('正在向所选来源查找…'); setResults([])
    try {
      const candidates = (await request()).slice(0, 6)
      if (current !== generation.current) return
      setResults(candidates.map(candidate => ({ candidate, imagePending: Boolean(candidate.coverUrl) })))
      setMessage(candidates.length ? '确认书名、作者或年份，选中后才写入卡片。' : '没有找到匹配作品，书名纸封仍然可以使用。')
      setLoading(false)
      // Two workers only; previews remain ephemeral and never become saved assets until Save.
      let index = 0
      const worker = async () => {
        while (current === generation.current && index < candidates.length) {
          const position = index++, candidate = candidates[position]
          if (!candidate.coverUrl) continue
          let file: File | undefined, imageError: string | undefined
          try { file = await lookupCoverImage(candidate.coverUrl) } catch { imageError = '封面暂不可用，可以只采用名称' }
          if (current === generation.current) setResults(previous => previous.map((item, i) => i === position ? { candidate, file, imagePending: false, imageError } : item))
        }
      }
      await Promise.all([worker(), worker()])
    } catch (error) {
      if (current === generation.current) setMessage(error instanceof Error ? error.message : String(error))
    } finally { if (current === generation.current) setLoading(false) }
  }
  return { results, loading, message,
    search: (provider: CoverProvider | 'auto', category: ExperienceCategory, hints: CoverHints) => run(() => lookupCovers(provider, category, hints)),
    resolve: (url: string) => run(async () => [await experienceCovers.resolveLink(url)]),
    clear: () => { generation.current++; setResults([]); setLoading(false); setMessage('') },
  }
}
