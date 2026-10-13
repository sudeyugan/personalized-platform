import { Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLibraryStore } from '../../state/useLibraryStore'
import { searchApplication, type ApplicationSearchHit } from './applicationSearch'
import { useApplicationSearch } from './useApplicationSearch'
import './globalSearch.css'

export function GlobalSearch({ onClose }: { onClose: () => void }) {
  const data = useLibraryStore(state => state.data)
  const [query, setQuery] = useState('')
  const [selection, setSelection] = useState(0)
  const { results, loading, error } = useApplicationSearch(data, query, true)
  const ref = useRef<HTMLElement>(null)
  const active = Math.min(selection, Math.max(0, results.length - 1))
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.querySelector('input')?.focus()
    return () => previous?.focus()
  }, [])
  const open = (hit: ApplicationSearchHit) => {
    const store = useLibraryStore.getState()
    if (!searchApplication(store.data, query).some(item => item.id === hit.id)) return
    if (hit.destination === 'writing.chapter' && hit.targetId) store.selectChapter(hit.targetId)
    else if (hit.group === '作品' && hit.targetId) { store.selectWork(hit.targetId); store.navigate('writing') }
    else if (hit.destination) store.openAgentDestination({ destination: hit.destination, targetId: hit.targetId, date: hit.date, section: hit.section, ...(hit.view === 'todos' ? { filter: 'all' } : {}) })
    else { store.navigate(hit.view); if (hit.targetId) store.openAgentDestination({ destination: hit.view, targetId: hit.targetId }) }
    onClose()
  }
  return <div className="search-overlay" onMouseDown={onClose}>
    <section ref={ref} role="dialog" aria-modal="true" aria-label="搜索整个程序" onMouseDown={event => event.stopPropagation()} onKeyDown={event => {
      if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.preventDefault(); onClose() }
      if (event.key === 'Tab') {
        const items = [...ref.current?.querySelectorAll<HTMLElement>('input,button') ?? []]
        const index = items.indexOf(document.activeElement as HTMLElement)
        if (event.shiftKey && index === 0 || !event.shiftKey && index === items.length - 1) { event.preventDefault(); items[event.shiftKey ? items.length - 1 : 0]?.focus() }
      }
    }}>
      <header><Search size={18} /><input value={query} aria-label="搜索整个程序" placeholder="搜索作品、日记、经历、待办、资料…" onChange={event => { setQuery(event.target.value); setSelection(0) }} onKeyDown={event => {
        if (event.nativeEvent.isComposing) return
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setSelection((active + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % (results.length || 1)) }
        if (event.key === 'Enter' && results[active]) { event.preventDefault(); open(results[active]) }
      }} /><button aria-label="关闭搜索" onClick={onClose}><X size={17} /></button></header>
      <div className="search-results" aria-busy={loading}>
        {!query.trim() && <p>搜索本机内容和功能入口。已关闭模块、锁定作品和回收站内容不参与搜索。</p>}
        {loading && <p role="status">正在查找…</p>}{error && <p role="alert">搜索暂时不可用，请重新输入重试。</p>}
        {results.map((hit, index) => <button className={index === active ? 'global-search-selected' : ''} key={hit.id} onClick={() => open(hit)}>
          <span className="global-search-group">{hit.group}</span><span><strong>{hit.title}</strong><small>{hit.excerpt}</small></span>
        </button>)}
        {query.trim() && !loading && !error && !results.length && <p>没有找到相关内容</p>}
      </div>
    </section>
  </div>
}
