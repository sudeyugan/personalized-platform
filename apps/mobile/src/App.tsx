import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { Bookmark, ChevronLeft, Search, Settings2, X } from 'lucide-react'
import { getSnapshot, initialize, subscribe, sync } from './repository'
import { searchable, text } from './data'
import { HomePage } from './pages/HomePage'
import { PlannerPage } from './pages/PlannerPage'
import { DiaryPage } from './pages/DiaryPage'
import { SettingsPage } from './pages/SettingsPage'
import { Chat } from './Chat'
import { mobilePage, pageLabels, parentPage } from './navigation'
import { PageIndex } from './components/PageIndex'
import './native'
import { VoiceCoordinator } from './companion/voice'
const IdeasPage = lazy(() => import('./pages/IdeasPage'))
const MoodPage = lazy(() => import('./pages/MoodPage'))
export default function App() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)
  const [page, setPage] = useState(() =>
    mobilePage(sessionStorage.getItem('yiyu.mobile.page') || 'home'),
  )
  const [ready, setReady] = useState(false),
    [message, setMessage] = useState('')
  const [indexOpen, setIndexOpen] = useState(false)
  const closeIndex = useCallback(() => setIndexOpen(false), [])
  const [searching, setSearching] = useState(false),
    [query, setQuery] = useState(''),
    [target, setTarget] = useState<string>()
  const scroll = useRef(new Map<string, number>())
  const content = useRef<HTMLElement>(null)
  const go = useCallback(
    (next: string, key?: string) => {
      scroll.current.set(page, content.current?.scrollTop ?? 0)
      setPage(mobilePage(next))
      setTarget(key)
      setSearching(false)
      setIndexOpen(false)
    },
    [page],
  )
  useEffect(() => {
    sessionStorage.setItem('yiyu.mobile.page', page)
    const frame = requestAnimationFrame(() => content.current?.scrollTo(0, scroll.current.get(page) ?? 0))
    return () => cancelAnimationFrame(frame)
  }, [page])
  useEffect(() => {
    const back = (event: Event) => {
      if (document.querySelector('[aria-modal="true"]')) return
      if (searching) {
        event.preventDefault()
        setSearching(false)
      } else if (page !== 'home') {
        event.preventDefault()
        go(parentPage(page))
      }
    }
    window.addEventListener('yiyu-back', back)
    return () => window.removeEventListener('yiyu-back', back)
  }, [page, searching, go])
  useEffect(() => {
    void initialize()
      .then(() => {
        setReady(true)
        void sync()
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : '资料暂时无法打开'))
    const resume = () => {
      if (!document.hidden) void sync()
    }
    const timer = setInterval(resume, 30_000)
    window.addEventListener('online', resume)
    document.addEventListener('visibilitychange', resume)
    return () => {
      clearInterval(timer)
      window.removeEventListener('online', resume)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [])
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      document.documentElement.dataset.theme = media.matches ? 'dark' : 'warm'
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [])
  const action = async (job: () => Promise<unknown>) => {
    try {
      setMessage('')
      await job()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '尚未保存，请重试。')
    }
  }
  if (!ready)
    return (
      <main className="loading">
        <span className="seal">隅</span>
        <p>{message || '正在拾起这一隅…'}</p>
      </main>
    )
  const secondary = page !== 'home'
  const matches = searchable(snapshot.records, query)
  return (
    <div className="mobile-app">
      <VoiceCoordinator />
      <header className="app-bar">
        <div className="brand">
          {secondary ? (
            <button
              aria-label={'回到' + pageLabels[parentPage(page)]}
              className="icon-button"
              onClick={() => go(parentPage(page))}
            >
              <ChevronLeft size={20} />
            </button>
          ) : (
            <span className="seal">隅</span>
          )}
          <div>
            <small>一 隅 · 随 行</small>
            <span>{secondary ? pageLabels[page] : '有一隅，便有归处。'}</span>
          </div>
        </div>
        <div className="toolbar">
          <button
            className="icon-button"
            aria-label="搜索手机记录"
            onClick={() => setSearching(!searching)}
          >
            <Search size={19} />
          </button>
          <button
            className="icon-button"
            aria-label="连接与设置"
            aria-current={page === 'settings' ? 'page' : undefined}
            onClick={() => go('settings')}
          >
            <Settings2 size={19} />
          </button>
        </div>
      </header>
      {(message || snapshot.error) && (
        <div className="notice" role="status">
          {message || snapshot.error}
          {message && (
            <button aria-label="收起提示" onClick={() => setMessage('')}>
              <X size={14} />
            </button>
          )}
        </div>
      )}
      <main key={page} ref={content} className="page-content">
        {searching ? (
          <section>
            <p className="eyebrow">只在手机保留的记录里寻找</p>
            <h1>找回一笔</h1>
            <input
              aria-label="搜索关键词"
              autoFocus
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="日记、待办、课程、想法…"
            />
            <div className="record-list">
              {matches.map(([key, value]) => (
                <button
                  className="paper-card search-result"
                  key={key}
                  onClick={() => go(key.split('/')[0], key)}
                >
                  <small>{pageLabels[key.split('/')[0]]}</small>
                  <h3>
                    {text(value.title) || text(value.subject) || text(value.date) || '心情记录'}
                  </h3>
                  <p>{text(value.note) || text(value.content) || text(value.draft)}</p>
                </button>
              ))}
            </div>
            {query && !matches.length && <p className="empty">本机手机记录里还没有找到。</p>}
          </section>
        ) : (
          <Suspense fallback={<div className="empty">正在展开这一页…</div>}>
            {page === 'home' ? (
              <HomePage records={snapshot.records} go={go} action={action} />
            ) : ['planner', 'todos', 'assignments', 'calendar', 'courses'].includes(page) ? (
              <PlannerPage
                key={page + (target ?? '')}
                records={snapshot.records}
                initial={page}
                action={action}
                target={target}
              />
            ) : page === 'diary' ? (
              <DiaryPage records={snapshot.records} target={target} action={action} />
            ) : page === 'ideas' ? (
              <IdeasPage records={snapshot.records} target={target} />
            ) : page === 'moods' ? (
              <MoodPage key={target} records={snapshot.records} action={action} target={target} />
            ) : page === 'chat' ? (
              <Chat />
            ) : (
              <SettingsPage snapshot={snapshot} action={action} />
            )}
          </Suspense>
        )}
      </main>
      <footer className="folio-foot"><span>各有一页，同在一隅。</span><button className="folio-bookmark" aria-label="展开功能索引" aria-expanded={indexOpen} aria-controls="folio-index" onClick={() => setIndexOpen(true)}><Bookmark size={19} strokeWidth={1.5}/><span>卷目</span></button></footer>
      {indexOpen && <PageIndex current={page} go={go} close={closeIndex}/>}
    </div>
  )
}
