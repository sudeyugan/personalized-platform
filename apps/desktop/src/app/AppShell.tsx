import { BookHeart, BookOpenText, ChevronDown, ChevronRight, CloudOff, FileText, PanelRight, Search, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { navigationItems } from './moduleManifest'
import { resolveContentBackground } from './backgrounds'
import { useLibraryStore } from '../state/useLibraryStore'
import { libraryRepository, type SearchHit } from '../infrastructure/libraryRepository'
import { BackgroundArt } from '../modules/backgrounds/BackgroundArt'
import { backgroundPresentation } from '../modules/backgrounds/backgroundPresentation'
import { useBackgroundImage } from '../modules/backgrounds/useBackgroundImage'
import { PlaybackDock } from '../modules/music/PlaybackDock'

const HomeView = lazy(() => import('../modules/home/HomeView').then((module) => ({ default: module.HomeView })))
const AnswerBookView = lazy(() => import('../modules/answer-book/AnswerBookView').then((module) => ({ default: module.AnswerBookView })))
const FortuneView = lazy(() => import('../modules/fortune/FortuneView').then((module) => ({ default: module.FortuneView })))
const ExperiencesView = lazy(() => import('../modules/experiences').then((module) => ({ default: module.ExperiencesView })))
const TruthView = lazy(() => import('../modules/truth/TruthView').then((module) => ({ default: module.TruthView })))
const CalendarScheduleView = lazy(() => import('../modules/planner/CalendarScheduleView').then((module) => ({ default: module.CalendarScheduleView })))
const DiaryView = lazy(() => import('../modules/planner/DiaryView').then((module) => ({ default: module.DiaryView })))
const TodoView = lazy(() => import('../modules/planner/TodoView').then((module) => ({ default: module.TodoView })))
const WritingView = lazy(() => import('../modules/writing/WritingView').then((module) => ({ default: module.WritingView })))
const RecordsHub = lazy(() => import('../modules/records/RecordsHub').then((module) => ({ default: module.RecordsHub })))
const AssetsView = lazy(() => import('../modules/assets/AssetsView').then((module) => ({ default: module.AssetsView })))
const MusicView = lazy(() => import('../modules/music/MusicView').then((module) => ({ default: module.MusicView })))
const HelpView = lazy(() => import('../modules/help/HelpView').then((module) => ({ default: module.HelpView })))
const SettingsView = lazy(() => import('../modules/settings/SettingsView').then((module) => ({ default: module.SettingsView })))

export function AppShell() {
  const { data, health, saveStatus, navigate, closeChapter, selectChapter, toggleRightPanel } = useLibraryStore()
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
  const truthEnabled = data.settings.modules.find((module) => module.id === 'truth')?.enabled ?? true
  const fortuneEnabled = data.settings.modules.find((module) => module.id === 'fortune')?.enabled ?? true
  const experiencesEnabled = data.settings.modules.find((module) => module.id === 'experiences')?.enabled ?? true
  const orderedNavigation = data.settings.navigationOrder.map((id) => navigationItems.find((item) => item.id === id)).filter((item) => item && !item.secondary && (item.group !== 'writing' || writingEnabled) && (item.id !== 'music' || musicEnabled) && (item.id !== 'answerBook' || answerBookEnabled) && (item.id !== 'truth' || truthEnabled) && (item.id !== 'fortune' || fortuneEnabled) && (item.id !== 'experiences' || experiencesEnabled))
  const writingViewActive = navigationItems.some((item) => item.group === 'writing' && item.id === activeView)
  const contentBackground = resolveContentBackground(data.settings, activeView)
  const sidebarBackground = useBackgroundImage(data.settings.backgrounds.images.sidebar)
  const backgroundStyle = backgroundPresentation(data.settings.backgrounds).style

  const toggleWritingNavigation = () => {
    setWritingNavigationOpen((current) => {
      window.localStorage.setItem('yiyu:writing-navigation-open', String(!current))
      return !current
    })
  }

  const view = (() => {
    if (activeView === 'home') return <HomeView />
    if (activeView === 'answerBook') return <AnswerBookView />
    if (activeView === 'fortune') return fortuneEnabled ? <FortuneView /> : <HomeView />
    if (activeView === 'experiences') return experiencesEnabled ? <ExperiencesView /> : <HomeView />
    if (activeView === 'truth') return truthEnabled ? <TruthView /> : <HomeView />
    if (activeView === 'calendar') return <CalendarScheduleView />
    if (activeView === 'diary') return <DiaryView />
    if (activeView === 'todos') return <TodoView />
    if (activeView === 'writing') return <WritingView key={activeChapterId || 'empty'} />
    if (activeView === 'people' || activeView === 'places' || activeView === 'timeline') return <RecordsHub />
    if (activeView === 'assets') return <AssetsView />
    if (activeView === 'music') return <MusicView />
    if (activeView === 'help') return <HelpView />
    return <SettingsView />
  })()

  return (
    <div className={'app-frame' + (data.session.focusMode ? ' focus-mode' : '') + (contentBackground.image ? ' has-unified-background' : '')} style={backgroundStyle}>
      <BackgroundArt source={contentBackground.image} settings={data.settings.backgrounds} />
      <aside className={`primary-sidebar sidebar-background-${data.settings.backgrounds.sidebarMode}${sidebarBackground ? ' has-sidebar-background' : ''}`}>
        {sidebarBackground && <div aria-hidden="true" className="sidebar-background-art"><img alt="" src={sidebarBackground} /></div>}
        <div className="brand-lockup">
          <div className="brand-mark small">隅</div>
          <div><strong>一隅</strong><span>安放你的故事</span></div>
        </div>

        <button className="search-trigger" onClick={() => setSearchOpen(true)} type="button"><Search size={16} /><span>搜索章节</span><kbd>Ctrl K</kbd></button>

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
                  <button className={(activeView === item.id || item.id === 'people' && ['places', 'timeline'].includes(activeView)) ? 'nav-item active' : 'nav-item'} key={item.id} onClick={() => navigate(item.id)} type="button">
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

      <section className={`workspace${activeView !== 'writing' || !openChapterIds.length ? ' workspace-fortune' : ''}`}>
        <header className="window-toolbar">
          {saveStatus === 'error' ? <div className="offline-chip save-error" role="alert">保存失败，请重试后再关闭应用</div> : null}
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
      {(activeView === 'music' || Boolean(data.session.currentTrackId)) && <PlaybackDock moduleEnabled={musicEnabled} showEmptyHint={activeView === 'music'} />}
    </div>
  )
}
