import { BookHeart, BookOpenText, ChevronDown, ChevronLeft, ChevronRight, CloudOff, FileText, PanelRight, Search, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useState, type CSSProperties } from 'react'
import { navigationItems } from './moduleManifest'
import { resolveContentBackground } from './backgrounds'
import { useLibraryStore } from '../state/useLibraryStore'
import { libraryRepository, type SearchHit } from '../infrastructure/libraryRepository'
import { PlaybackDock } from '../modules/music/PlaybackDock'

const HomeView = lazy(() => import('../modules/home/HomeView').then((module) => ({ default: module.HomeView })))
const AnswerBookView = lazy(() => import('../modules/answer-book/AnswerBookView').then((module) => ({ default: module.AnswerBookView })))
const CalendarScheduleView = lazy(() => import('../modules/planner/CalendarScheduleView').then((module) => ({ default: module.CalendarScheduleView })))
const DiaryView = lazy(() => import('../modules/planner/DiaryView').then((module) => ({ default: module.DiaryView })))
const TodoView = lazy(() => import('../modules/planner/TodoView').then((module) => ({ default: module.TodoView })))
const WritingView = lazy(() => import('../modules/writing/WritingView').then((module) => ({ default: module.WritingView })))
const RecordsView = lazy(() => import('../modules/records/RecordsView').then((module) => ({ default: module.RecordsView })))
const TimelineView = lazy(() => import('../modules/records/TimelineView').then((module) => ({ default: module.TimelineView })))
const AssetsView = lazy(() => import('../modules/assets/AssetsView').then((module) => ({ default: module.AssetsView })))
const MusicView = lazy(() => import('../modules/music/MusicView').then((module) => ({ default: module.MusicView })))
const HelpView = lazy(() => import('../modules/help/HelpView').then((module) => ({ default: module.HelpView })))
const SettingsView = lazy(() => import('../modules/settings/SettingsView').then((module) => ({ default: module.SettingsView })))

export function AppShell() {
  const { data, health, navigate, closeChapter, selectChapter, toggleRightPanel } = useLibraryStore()
  const { activeView, activeChapterId, openChapterIds } = data.session
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchHit[]>([])
  const [writingNavigationOpen, setWritingNavigationOpen] = useState(() => window.localStorage.getItem('yiyu:writing-navigation-open') === 'true')
  useEffect(() => {
    const timer = setTimeout(() => { void libraryRepository.search(query).then(setSearchResults).catch(() => setSearchResults([])) }, 120)
    return () => clearTimeout(timer)
  }, [query, data.chapters])
  useEffect(() => {
    const openSearch = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'k') { event.preventDefault(); setSearchOpen(true) } }
    window.addEventListener('keydown', openSearch)
    return () => window.removeEventListener('keydown', openSearch)
  }, [])
  const writingEnabled = data.settings.modules.find((module) => module.id === 'writing')?.enabled ?? true
  const musicEnabled = data.settings.modules.find((module) => module.id === 'music')?.enabled ?? false
  const answerBookEnabled = data.settings.modules.find((module) => module.id === 'answerBook')?.enabled ?? true
  const orderedNavigation = data.settings.navigationOrder.map((id) => navigationItems.find((item) => item.id === id)).filter((item) => item && (item.group !== 'writing' || writingEnabled) && (item.id !== 'music' || musicEnabled) && (item.id !== 'answerBook' || answerBookEnabled))
  const writingViewActive = navigationItems.some((item) => item.group === 'writing' && item.id === activeView)
  const contentBackground = resolveContentBackground(data.settings, activeView)
  const sidebarBackground = data.settings.backgrounds.images.sidebar
  const sidebarStyle = sidebarBackground ? { '--sidebar-art': `url(${sidebarBackground})` } as CSSProperties : undefined

  const toggleWritingNavigation = () => {
    setWritingNavigationOpen((current) => {
      window.localStorage.setItem('yiyu:writing-navigation-open', String(!current))
      return !current
    })
  }

  const view = (() => {
    if (activeView === 'home') return <HomeView />
    if (activeView === 'answerBook') return <AnswerBookView />
    if (activeView === 'calendar') return <CalendarScheduleView />
    if (activeView === 'diary') return <DiaryView />
    if (activeView === 'todos') return <TodoView />
    if (activeView === 'writing') return <WritingView key={activeChapterId || 'empty'} />
    if (activeView === 'people') return <RecordsView type="people" />
    if (activeView === 'places') return <RecordsView type="places" />
    if (activeView === 'timeline') return <TimelineView />
    if (activeView === 'assets') return <AssetsView />
    if (activeView === 'music') return <MusicView />
    if (activeView === 'help') return <HelpView />
    return <SettingsView />
  })()

  return (
    <div className={data.session.focusMode ? 'app-frame focus-mode' : 'app-frame'}>
      <aside className={`primary-sidebar sidebar-background-${data.settings.backgrounds.sidebarMode}${sidebarBackground ? ' has-sidebar-background' : ''}`} style={sidebarStyle}>
        <div className="brand-lockup">
          <div className="brand-mark small">隅</div>
          <div><strong>一隅</strong><span>安放你的故事</span></div>
        </div>

        <button className="search-trigger" onClick={() => setSearchOpen(true)} type="button"><Search size={16} /><span>搜索一切</span><kbd>Ctrl K</kbd></button>

        <nav className="main-navigation" aria-label="主导航">
          {(['main', 'writing', 'system'] as const).map((group) => (
            <div className={group === 'writing' ? 'nav-group writing-nav-group' : 'nav-group'} key={group}>
              {group === 'writing' && (
                <button className={writingViewActive ? 'nav-item nav-section-toggle has-active-view' : 'nav-item nav-section-toggle'} aria-expanded={writingNavigationOpen} onClick={toggleWritingNavigation} type="button">
                  <BookOpenText size={18} strokeWidth={1.7} />
                  <span>创作空间</span>
                  {writingNavigationOpen ? <ChevronDown className="nav-section-chevron" size={14} /> : <ChevronRight className="nav-section-chevron" size={14} />}
                </button>
              )}
              {(group !== 'writing' || writingNavigationOpen) && orderedNavigation.filter((item) => item?.group === group).map((item) => {
                if (!item) return null
                const Icon = item.icon
                return (
                  <button className={activeView === item.id ? 'nav-item active' : 'nav-item'} key={item.id} onClick={() => navigate(item.id)} type="button">
                    <Icon size={18} strokeWidth={1.7} />
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="quiet-note"><BookHeart size={16} /><span>今天也为自己<br />留下一点文字</span></div>
          <div className="runtime-state"><span className="status-dot" />{health?.runtime === 'tauri' ? '本地资料库已连接' : '浏览器预览模式'}</div>
        </div>
      </aside>

      <section className="workspace">
        {contentBackground.image && <div className="workspace-background" key={`${contentBackground.scene}-${contentBackground.image.length}-${contentBackground.image.slice(-12)}`} style={{ backgroundImage: `linear-gradient(color-mix(in srgb, var(--app-bg) 86%, transparent), color-mix(in srgb, var(--app-bg) 86%, transparent)), url(${contentBackground.image})` }} />}
        <header className="window-toolbar">
          <div className="history-buttons"><button aria-label="后退"><ChevronLeft size={17} /></button><button aria-label="前进"><ChevronRight size={17} /></button></div>
          <div className="toolbar-spacer" />
          <div className="offline-chip"><CloudOff size={14} /> 本地优先</div>
          <button className={data.settings.showRightPanel ? 'icon-button active' : 'icon-button'} aria-label="切换右侧栏" onClick={toggleRightPanel}><PanelRight size={18} /></button>
        </header>

        {activeView === 'writing' && openChapterIds.length > 0 && (
          <div className="tab-strip">
            {openChapterIds.map((chapterId) => {
              const chapter = data.chapters[chapterId]
              if (!chapter) return null
              return (
                <button className={chapterId === activeChapterId ? 'document-tab active' : 'document-tab'} key={chapterId} onClick={() => selectChapter(chapterId)}>
                  <span>{chapter.title}</span>
                  <X size={13} onClick={(event) => { event.stopPropagation(); closeChapter(chapterId) }} />
                </button>
              )
            })}
          </div>
        )}

        <div className="view-stage"><Suspense fallback={<main className="launch-screen"><p>正在打开这一页…</p></main>}>{view}</Suspense></div>
      </section>
      {searchOpen && <div className="search-overlay" onMouseDown={() => setSearchOpen(false)}><section onMouseDown={(event) => event.stopPropagation()}><header><Search size={18} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索章节标题和正文…" /><button onClick={() => setSearchOpen(false)}><X size={17} /></button></header><div className="search-results">{searchResults.map((hit) => <button key={hit.chapterId} onClick={() => { selectChapter(hit.chapterId); setSearchOpen(false) }}><FileText size={16} /><span><strong>{hit.title}</strong><small>{hit.excerpt}</small></span></button>)}{query && searchResults.length === 0 && <p>没有找到相关内容</p>}</div></section></div>}
      {(musicEnabled || Boolean(data.session.currentTrackId)) && <PlaybackDock moduleEnabled={musicEnabled} showEmptyHint={activeView === 'music'} />}
    </div>
  )
}
