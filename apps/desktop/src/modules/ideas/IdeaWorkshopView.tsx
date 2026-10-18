import { BookOpen, Feather, Plus, Settings2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { IdeaMode } from '../../domain/ideas/types'
import { useLibraryStore } from '../../state/useLibraryStore'
import { PrivacyReviewCard } from '../companion/PrivacyReviewCard'
import { useNavigationTarget } from '../search/useNavigationTarget'
import { InkLandscape } from './InkLandscape'
import { IdeaLibraryDrawer } from './IdeaLibraryDrawer'
import { IdeaFirstPage } from './IdeaFirstPage'
import { IdeaThinkingScroll } from './IdeaThinkingScroll'
import { ManuscriptSheet } from './ManuscriptSheet'
import { generateIdeaRound } from './service'
import { useIdeaRound } from './useIdeaRound'
import './ideas.css'
import './scroll.css'
import './manuscript.css'
import './ink.css'

export function IdeaWorkshopView({ generate = generateIdeaRound }: { generate?: typeof generateIdeaRound }) {
  const data = useLibraryStore(state => state.data.ideas) ?? { sessions: [] }
  const provider = useLibraryStore(state => state.data.companion.provider.providerId)
  const saveStatus = useLibraryStore(state => state.saveStatus)
  const [seed, setSeed] = useState(''), [input, setInput] = useState('')
  const [notebookOpen, setNotebookOpen] = useState(false), [view, setView] = useState<'thinking' | 'manuscript'>('thinking')
  const [arrival, setArrival] = useState<string>()
  const session = data.sessions.find(item => item.id === data.activeId && !item.deletedAt)
  const { run, busy, error, review, cancel } = useIdeaRound(session?.id, generate)
  const target = useNavigationTarget('ideas')
  const page = useRef<HTMLElement>(null), switchRef = useRef<HTMLButtonElement>(null)
  const seen = useRef(new Set(data.sessions.flatMap(item => item.turns.map(turn => turn.id))))
  const lastTurn = session?.turns.at(-1)
  useEffect(() => { if (target) useLibraryStore.getState().selectIdea(target) }, [target])
  useEffect(() => { setInput(''); setView('thinking'); setArrival(undefined) }, [session?.id])
  useEffect(() => {
    if (!lastTurn || seen.current.has(lastTurn.id)) return
    seen.current.add(lastTurn.id)
    setArrival(lastTurn.id); setInput('')
    if (lastTurn.mode === 'collect') { setView('manuscript'); switchRef.current?.focus({ preventScroll: true }) }
    page.current?.scrollTo?.({ top: 0, behavior: 'instant' })
    const timer = setTimeout(() => setArrival(undefined), 2800)
    return () => clearTimeout(timer)
  }, [lastTurn?.id]) // eslint-disable-line react-hooks/exhaustive-deps -- A completed turn, not editor/store updates, starts one arrival.
  const submit = (value: string, mode: IdeaMode = 'explore') => {
    if (session && !busy && value.trim()) { setArrival(undefined); void run(session.id, value, mode) }
  }
  const closeNotebook = useCallback(() => setNotebookOpen(false), [])
  const newIdea = () => { cancel(); closeNotebook(); useLibraryStore.getState().selectIdea(undefined) }
  const selectIdea = (id: string) => {
    cancel(); closeNotebook(); setArrival(undefined)
    const selected = data.sessions.find(item => item.id === id)
    selected?.turns.forEach(turn => seen.current.add(turn.id))
    useLibraryStore.getState().selectIdea(id)
  }
  const start = () => {
    if (!seed.trim() || busy) return
    const id = useLibraryStore.getState().createIdea(seed)
    void run(id, seed); setSeed('')
  }
  const changeView = (value: typeof view) => { setArrival(undefined); setView(value) }
  return <main ref={page} className="ideas-workshop" data-scene={!session ? 'opening' : view === 'manuscript' ? 'gathered' : session.turns.length > 1 ? 'branching' : 'listening'}>
    <InkLandscape />
    <div className="idea-workspace-content" inert={notebookOpen || undefined}>
      <header className="idea-page-heading">
        <div className="idea-brand"><span className="idea-seal" aria-hidden="true">酝<br />酿</span><div><span className="idea-eyebrow">一隅 / 想法工坊</span><h1>念起 · 墨间</h1></div></div>
        <nav className="idea-page-tools" aria-label="长卷工具"><button type="button" className="idea-text-button" aria-haspopup="dialog" aria-expanded={notebookOpen} onClick={() => setNotebookOpen(true)}><BookOpen size={15} /> 手稿册</button><button className="idea-small-icon" type="button" aria-label="写下新的想法" onClick={newIdea}><Plus size={18} /></button></nav>
      </header>
      {session && <div className="idea-scroll-navigation"><span className="idea-scroll-title">{session.title}</span><div className="idea-view-switch" role="group" aria-label="长卷阅读方式"><button type="button" aria-pressed={view === 'thinking'} onClick={() => changeView('thinking')}>推敲</button><span aria-hidden="true">/</span><button ref={switchRef} type="button" aria-pressed={view === 'manuscript'} onClick={() => changeView('manuscript')}><Feather size={12} /> 成稿</button></div></div>}
      <div className={`idea-scroll-stage${!session ? ' is-new' : ''}`}>
        {!session ? <IdeaFirstPage seed={seed} setSeed={setSeed} start={start} busy={busy} /> : view === 'thinking'
          ? <IdeaThinkingScroll key={session.id} session={session} busy={busy} error={error} reviewing={!!review} input={input} setInput={setInput} submit={submit} cancel={cancel} reveal={arrival === lastTurn?.id && !!arrival} finishReveal={() => setArrival(undefined)} beforeFork={() => { cancel(); setArrival(undefined) }} />
          : <ManuscriptSheet key={session.id} session={session} busy={busy} reveal={arrival === lastTurn?.id && !!arrival} finishReveal={() => setArrival(undefined)} onContinue={() => { setView('thinking'); setArrival(undefined) }} />}
        {review && <PrivacyReviewCard request={review.request} onDecision={review.decide} />}
        {view === 'manuscript' && busy && <div className="idea-busy" role="status">{review ? '等待你确认发送内容' : '正在推敲，原稿仍在'}<button type="button" className="idea-text-button" onClick={cancel}>暂停</button></div>}
        {view === 'manuscript' && error && <p className="idea-error" role="alert">{error}</p>}
        {provider === 'mock' && <div className="idea-api-note"><Settings2 size={15} /><span>复用 AI 伙伴的模型配置，连接后即可开始。</span><button type="button" className="idea-text-button" onClick={() => useLibraryStore.getState().navigate('settings')}>去设置</button></div>}
      </div>
      <footer className="idea-page-colophon"><span className="idea-save-state" role="status">{saveStatus === 'error' ? '保存未成功，请暂勿关闭' : saveStatus === 'saving' ? '正在留存…' : '手稿留在本机'}</span><span>仅本份想法参与模型处理 · 随资料库备份保存</span><span aria-hidden="true">一念一笔</span></footer>
    </div>
    {notebookOpen && <IdeaLibraryDrawer data={data} onClose={closeNotebook} onNew={newIdea} onSelect={selectIdea} />}
  </main>
}
