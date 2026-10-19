import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react'
import {
  BookOpen,
  ChevronLeft,
  Feather,
  Flower2,
  Home,
  LayoutGrid,
  MessageCircle,
  RefreshCw,
  Search,
  Settings2,
  X,
} from 'lucide-react'
import { getSnapshot, initialize, subscribe, sync } from './repository'
import { searchable, text } from './data'
import { HomePage } from './pages/HomePage'
import { PlannerPage } from './pages/PlannerPage'
import { RecordsPage } from './pages/RecordsPage'
import { SettingsPage } from './pages/SettingsPage'
import { Chat } from './Chat'
import './native'
const WritingPage = lazy(() => import('./pages/WritingPage'))
const IdeasPage = lazy(() => import('./pages/IdeasPage'))
const MoodPage = lazy(() => import('./pages/MoodPage'))
const RitualPage = lazy(() => import('./pages/RitualPage'))
const navigation = [
  { id: 'home', label: '今日', icon: Home },
  { id: 'planner', label: '日常', icon: Flower2 },
  { id: 'writing', label: '创作', icon: Feather },
  { id: 'chat', label: '小鱼', icon: MessageCircle },
  { id: 'more', label: '书房', icon: LayoutGrid },
]
const rooms = [
  { id: 'diary', label: '日记', detail: '把日子写在纸上' },
  { id: 'moods', label: '每日心情', detail: '五点心情，气泡与色带' },
  { id: 'ideas', label: '想法工坊', detail: '在墨间，慢慢想清楚' },
  { id: 'experiences', label: '经历册', detail: '作品、足迹与偏爱' },
  { id: 'calendar', label: '日历', detail: '月历与每日安排' },
  { id: 'courses', label: '课表', detail: '随身带着这一周' },
  { id: 'people', label: '人物', detail: '现实与创作中的相逢' },
  { id: 'places', label: '地点', detail: '那些故事发生的地方' },
  { id: 'events', label: '时间线', detail: '把事情连成来路' },
  { id: 'ritual', label: '片刻仪式', detail: '一隅签、答案之书、真心话' },
  { id: 'settings', label: '连接与设置', detail: '多端同行，伙伴与隐私' },
]
export default function App() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)
  const [page, setPage] = useState(() => sessionStorage.getItem('yiyu.mobile.page') || 'home'),
    [ready, setReady] = useState(false),
    [message, setMessage] = useState('')
  const [searching, setSearching] = useState(false),
    [query, setQuery] = useState(''),
    [target, setTarget] = useState<string>()
  const go = (next: string, key?: string) => {
    setPage(next)
    setTarget(key)
    setSearching(false)
    window.scrollTo(0, 0)
  }
  useEffect(() => {
    sessionStorage.setItem('yiyu.mobile.page', page)
  }, [page])
  useEffect(() => {
    const back = (event: Event) => {
      if (document.querySelector('[aria-modal="true"]')) return
      if (searching) {
        event.preventDefault()
        setSearching(false)
      } else if (page !== 'home') {
        event.preventDefault()
        go('home')
      }
    }
    window.addEventListener('yiyu-back', back)
    return () => window.removeEventListener('yiyu-back', back)
  }, [page, searching])
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
  const section = ['calendar', 'courses', 'diary', 'moods'].includes(page)
    ? 'planner'
    : ['people', 'places', 'events', 'ideas'].includes(page)
      ? 'writing'
      : rooms.some((room) => room.id === page)
        ? 'more'
        : page
  const heading =
    rooms.find((room) => room.id === page)?.label ?? navigation.find((item) => item.id === page)?.label
  return (
    <div className="mobile-app">
      <header className="app-bar">
        <div className="brand">
          {rooms.some((room) => room.id === page) ? (
            <button aria-label="回到书房" className="icon-button" onClick={() => go('more')}>
              <ChevronLeft size={20} />
            </button>
          ) : (
            <span className="seal">隅</span>
          )}
          <div>
            <small>一 隅 · 随 行</small>
            <span>{heading === '今日' ? '有一隅，便有归处。' : heading}</span>
          </div>
        </div>
        <div className="toolbar">
          <button className="icon-button" aria-label="搜索本机资料" onClick={() => setSearching(!searching)}>
            <Search size={19} />
          </button>
          <button
            className="icon-button"
            aria-label={snapshot.busy ? '同步中' : '同步'}
            disabled={snapshot.busy}
            onClick={() => void sync()}
          >
            <RefreshCw size={17} className={snapshot.busy ? 'spinning' : ''} />
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
      <main className="page-content">
        {searching ? (
          <section>
            <h1>找回一笔</h1>
            <input
              aria-label="搜索关键词"
              autoFocus
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="标题、正文、人物、感想…"
            />
            <div className="record-list">
              {searchable(snapshot.records, query).map(([key, value]) => (
                <button
                  className="paper-card search-result"
                  key={key}
                  onClick={() => {
                    const collection = key.split('/')[0]
                    go(
                      ['works', 'chapters', 'volumes'].includes(collection)
                        ? 'writing'
                        : collection === 'assignments' || collection === 'todos'
                          ? 'planner'
                          : collection,
                      key,
                    )
                  }}
                >
                  <small>{key.split('/')[0]}</small>
                  <h3>{text(value.title) || text(value.name) || text(value.date) || '心情记录'}</h3>
                  <p>{text(value.plainText) || text(value.note) || text(value.summary)}</p>
                </button>
              ))}
            </div>
            {query && !searchable(snapshot.records, query).length && (
              <p className="empty">本机资料里还没有找到。</p>
            )}
          </section>
        ) : (
          <Suspense fallback={<div className="empty">正在展开这一页…</div>}>
            {page === 'home' ? (
              <HomePage records={snapshot.records} go={go} action={action} />
            ) : page === 'planner' || page === 'calendar' || page === 'courses' ? (
              <PlannerPage key={page} records={snapshot.records} initial={page} action={action} />
            ) : page === 'writing' ? (
              <WritingPage records={snapshot.records} target={target} action={action} />
            ) : page === 'ideas' ? (
              <IdeasPage records={snapshot.records} target={target} />
            ) : page === 'moods' ? (
              <MoodPage records={snapshot.records} action={action} />
            ) : page === 'chat' ? (
              <Chat />
            ) : page === 'settings' ? (
              <SettingsPage snapshot={snapshot} action={action} />
            ) : page === 'ritual' ? (
              <RitualPage />
            ) : page === 'more' ? (
              <section>
                <p className="eyebrow">每一种生活，都有自己的位置</p>
                <h1>随身书房</h1>
                <div className="room-grid">
                  {rooms.map((room, index) => (
                    <button className="room-card" key={room.id} onClick={() => go(room.id)}>
                      <span className="room-index">{String(index + 1).padStart(2, '0')}</span>
                      {room.id === 'settings' ? <Settings2 size={18} /> : <BookOpen size={18} />}
                      <h3>{room.label}</h3>
                      <p>{room.detail}</p>
                    </button>
                  ))}
                </div>
              </section>
            ) : (
              <RecordsPage
                key={page}
                collection={page}
                records={snapshot.records}
                target={target}
                action={action}
              />
            )}
          </Suspense>
        )}
      </main>
      <nav className="bottom-navigation" aria-label="页面">
        {navigation.map((item) => (
          <button
            key={item.id}
            aria-current={section === item.id ? 'page' : undefined}
            onClick={() => go(item.id)}
          >
            <item.icon size={20} strokeWidth={1.5} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
