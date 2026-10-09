import { useState } from 'react'
import { type CoverProvider, type ExperienceCategory } from '../../domain/experiences'
import { coverProviderLabels, suggestedProvider, type CoverCandidate } from '../../infrastructure/experienceCovers'
import { ExperienceArtwork } from './ExperienceArtwork'
import { useCoverResults } from './useCoverResults'
import { coverMatch } from './coverMatching'
import { CatalogSearch } from '../catalog-search/CatalogSearch'

export function CoverPicker({ category, title, creator = '', disabled, onPick }: { category: ExperienceCategory; title: string; creator?: string; disabled: boolean; onPick: (candidate: CoverCandidate, file?: File) => void }) {
  const [provider, setProvider] = useState<CoverProvider | 'auto'>('auto')
  const [query, setQuery] = useState<string | null>(null)
  const searchTitle = query ?? title
  const [link, setLink] = useState('')
  const [author, setAuthor] = useState<string | null>(null), [year, setYear] = useState('')
  const hints = { title: searchTitle, creator: author ?? creator, year }
  const search = useCoverResults()
  return <section className="experience-cover-picker">
    <button type="button" className="experience-find-cover" disabled={!searchTitle.trim() || search.loading || disabled} onClick={() => void search.search(provider, category, hints)}>{search.loading ? '正在找封面…' : '找封面'}</button>
    <details className="experience-cover-advanced"><summary>换个来源 / 用作品链接</summary>
    <div className="cover-search-controls"><select aria-label="封面来源" value={provider} disabled={disabled || search.loading} onChange={event => { setProvider(event.target.value as CoverProvider); search.clear() }}>
      <option value="auto">自动 · {coverProviderLabels[suggestedProvider(category)]}</option>{(['webnovel','weread','bangumi','openlibrary','tmdb'] as const).map(id => <option value={id} key={id}>{coverProviderLabels[id]}</option>)}</select>
      <input aria-label="找封面的作品名称" maxLength={160} value={searchTitle} onChange={event => setQuery(event.target.value)} placeholder="书名，可以带上作者" disabled={disabled} />
      </div>
    <div className="cover-search-controls"><input aria-label="封面作者提示" maxLength={100} value={hints.creator} placeholder="作者（可选，帮助区分同名作品）" disabled={disabled || search.loading} onChange={event => setAuthor(event.target.value)} /><input aria-label="封面年份提示" value={year} inputMode="numeric" maxLength={4} placeholder="年份（可选）" disabled={disabled || search.loading} onChange={event => setYear(event.target.value.replace(/\D/g, '').slice(0, 4))} /></div>
    <div className="cover-link-controls"><input aria-label="官方作品链接" type="url" value={link} disabled={disabled} onChange={event => setLink(event.target.value)} placeholder="起点 / 番茄 / 晋江 / 纵横 / 七猫 / 17K / Bangumi作品链接" /><button type="button" disabled={!link.trim() || search.loading || disabled} onClick={() => void search.resolve(link)}>识别链接</button></div>
    <CatalogSearch query={`${searchTitle} ${hints.creator} ${hints.year} ${category}`.trim()} disabled={disabled || search.loading} onQuery={value => { setQuery(value); search.clear() }} />
    </details>
    {search.message && <p role="status">{search.message}</p>}
    <div className="cover-candidate-grid">{search.results.map(result => <article key={result.candidate.provider + result.candidate.id} className="cover-candidate">
      <ExperienceArtwork entry={{ category, title: result.candidate.title, creator: result.candidate.creator, paperStyle: 'linen', dateText: '', note: '' }} file={result.file} />
      <strong>{result.candidate.title}</strong><small>{[result.candidate.creator, result.candidate.year].filter(Boolean).join(' · ') || coverProviderLabels[result.candidate.provider]}</small>
      <small>{coverMatch(result.candidate, hints).label}</small><a href={result.candidate.sourceUrl} target="_blank" rel="noreferrer">核对原始条目 ↗</a>
      <button type="button" disabled={disabled || result.imagePending} onClick={() => onPick(result.candidate, result.file)}>{result.imagePending ? '准备封面…' : result.file ? '采用这张' : '采用作品信息'}</button>
      {result.imageError && <small>{result.imageError}</small>}
    </article>)}</div>
  </section>
}
