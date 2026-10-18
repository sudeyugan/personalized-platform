import { ArrowUpRight, Check, CornerUpLeft, Pause, Settings2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { IDEA_LIMITS, type IdeaMode } from '../../domain/ideas/types'
import { useLibraryStore } from '../../state/useLibraryStore'
import { PrivacyReviewCard } from '../companion/PrivacyReviewCard'
import { useNavigationTarget } from '../search/useNavigationTarget'
import { InkLandscape } from './InkLandscape'
import { IdeaNotebook } from './IdeaNotebook'
import { ManuscriptSheet } from './ManuscriptSheet'
import { generateIdeaRound } from './service'
import { useIdeaRound } from './useIdeaRound'
import './ideas.css'

export function IdeaWorkshopView({ generate = generateIdeaRound }: { generate?: typeof generateIdeaRound }) {
  const data = useLibraryStore(state => state.data.ideas) ?? { sessions: [] }
  const provider = useLibraryStore(state => state.data.companion.provider.providerId)
  const saveStatus = useLibraryStore(state => state.saveStatus)
  const [seed, setSeed] = useState(''), [input, setInput] = useState(''), [historyOpen, setHistoryOpen] = useState(false)
  const session = data.sessions.find(item => item.id === data.activeId && !item.deletedAt)
  const frame = session?.turns.at(-1)?.frame
  const { run, busy, error, review, cancel } = useIdeaRound(session?.id, generate)
  const target = useNavigationTarget('ideas')
  const inputRef = useRef<HTMLTextAreaElement>(null), headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (target) useLibraryStore.getState().selectIdea(target) }, [target])
  useEffect(() => { setInput(''); setHistoryOpen(false) }, [session?.id])
  useEffect(() => { setInput(''); if (frame) headingRef.current?.focus({ preventScroll: true }) }, [session?.turns.length]) // eslint-disable-line react-hooks/exhaustive-deps -- Focus the new question only when a completed round is added.
  const submit = (value: string, mode: IdeaMode = 'explore') => {
    if (!session || busy || !value.trim()) return
    void run(session.id, value, mode)
  }
  const newIdea = () => { cancel(); useLibraryStore.getState().selectIdea(undefined) }
  const start = () => {
    if (!seed.trim() || busy) return
    const id = useLibraryStore.getState().createIdea(seed)
    void run(id, seed)
    setSeed('')
  }
  return <main className="ideas-workshop">
    <InkLandscape />
    <header className="idea-page-heading"><div className="idea-brand"><span className="idea-seal" aria-hidden="true">酝<br />酿</span><div><span className="idea-eyebrow">一隅 · 想法工坊</span><h1>让念头，慢慢成形</h1></div></div><span className="idea-save-state" role="status">{saveStatus === 'error' ? '保存未成功，请暂勿关闭' : saveStatus === 'saving' ? '正在落笔…' : '手稿留在本机'}</span></header>
    <div className="ideas-shell"><IdeaNotebook data={data} onNew={newIdea} onSelect={id => { cancel(); useLibraryStore.getState().selectIdea(id) }} />
      <div className={`idea-spread${!session ? ' is-new' : ''}`}>
        <section className="idea-thinking" aria-label="想法推敲">
          {!session ? <div className="idea-first-page ink-emerge"><span className="idea-eyebrow">起笔 · 不必先想完整</span><h2>此刻，有什么<br /><em>还没想清楚？</em></h2><p>一句直觉，一个困惑，或几句散落的话。<br />我们从这里开始，找到下一笔。</p><form onSubmit={event => { event.preventDefault(); start() }}><label htmlFor="idea-seed" className="idea-field-label">写下最初的念头</label><textarea id="idea-seed" value={seed} onChange={event => setSeed(event.target.value)} maxLength={IDEA_LIMITS.input} placeholder="比如：我总觉得每天都很忙，却没有做成真正重要的事……" rows={4} /><div className="idea-input-foot"><small>{seed.length || ''}{seed.length ? ` / ${IDEA_LIMITS.input}` : '暂时说不清，也没有关系'}</small><button type="submit" className="idea-primary" disabled={!seed.trim() || busy}>从这一念开始 <ArrowUpRight size={16} /></button></div></form><div className="idea-possibilities"><span>想解决一个问题</span><span>推敲一种判断</span><span>酝酿一个创意</span></div></div>
            : <div className="idea-round" key={session.turns.at(-1)?.id ?? session.id}>
              <div className="idea-round-heading"><span className="idea-eyebrow">{session.status === 'collected' ? '暂成一稿 · 仍可继续' : `推敲 ${String(session.turns.length || 1).padStart(2, '0')}`}</span>{!!session.turns.length && <button className="idea-text-button" type="button" onClick={() => setHistoryOpen(!historyOpen)} aria-expanded={historyOpen}><CornerUpLeft size={13} /> 回看与改选</button>}</div>
              {historyOpen && <section className="idea-history" aria-label="思考来路">{session.turns.map((turn, index) => <article key={turn.id}><small>第 {index + 1} 轮 · 你的原话</small><p>{turn.input}</p><p className="idea-caption">{turn.frame.question}</p><button type="button" className="idea-text-button" disabled={busy} onClick={() => { cancel(); useLibraryStore.getState().forkIdea(session.id, index) }}>从这里另开一条思路</button></article>)}</section>}
              {frame ? <div className="ink-emerge"><p className="idea-reflection">{frame.reflection}</p><h2 ref={headingRef} tabIndex={-1}>{session.status === 'collected' ? '先把这份想法，留在纸上。' : frame.question}</h2>{session.status !== 'collected' && <div className="idea-options">{frame.options.map((option, index) => <button type="button" className={session.pending?.input === option ? 'is-chosen' : ''} key={option} disabled={busy} onClick={() => submit(option)}><span className="idea-option-number">{['一', '二', '三', '四'][index]}</span><span>{option}</span><ArrowUpRight size={15} /></button>)}</div>}</div> : <><p className="idea-reflection idea-user-seed">{session.seed}</p>{!busy && <h2>从这一念，继续落笔。</h2>}</>}
              {busy && <div className="idea-busy" role="status"><span className="idea-ink-drop" /><span>{review ? '等待你确认发送内容' : '正在接住你的想法…'}</span><button type="button" onClick={cancel} className="idea-text-button"><Pause size={13} /> 暂停</button></div>}
              {error && <p className="idea-error" role="alert">{error}</p>}
              {!busy && session.pending && <div className="idea-retry"><p>上次停在这里：{session.pending.input.slice(0, 140)}</p><button type="button" className="idea-text-button" onClick={() => submit(session.pending!.input, session.pending!.mode)}>继续这一轮 <ArrowUpRight size={14} /></button></div>}
              {frame && <form className="idea-response" onSubmit={event => { event.preventDefault(); submit(input) }}><label htmlFor="idea-response" className="idea-field-label">{session.status === 'collected' ? '还有想继续展开的地方吗？' : '也可以用自己的话，补上另一种可能'}</label><textarea ref={inputRef} id="idea-response" value={input} disabled={busy} onChange={event => setInput(event.target.value)} maxLength={IDEA_LIMITS.input} placeholder="这些选项不贴切，或你想到了别的方向……" rows={3} /><div className="idea-input-foot"><button type="button" className="idea-text-button" disabled={busy} onClick={() => { setInput('这些方向还不太贴切，我更想说的是：'); inputRef.current?.focus() }}>都不太贴切</button><button className="idea-primary" disabled={busy || !input.trim()} type="submit">继续推敲 <ArrowUpRight size={15} /></button></div></form>}
              {frame && !busy && <div className="idea-round-footer">{session.status === 'collected' ? <button type="button" className="idea-text-button" onClick={() => submit('我想继续深化当前想法，请提出最值得进一步推敲的一个问题。')}>再往深处想想 <ArrowUpRight size={14} /></button> : <button type="button" className="idea-text-button" onClick={() => submit('请把目前的想法先整理成一份可用的手稿，保留仍未确定的部分，不替我作决定。', 'collect')}><Check size={14} /> 先整理到这里</button>}<small>每一个选择，都可以再想一想。</small></div>}
            </div>}
          {review && <PrivacyReviewCard request={review.request} onDecision={review.decide} />}
          {provider === 'mock' && <div className="idea-api-note"><Settings2 size={15} /><span>复用 AI 伙伴的模型配置，连接后即可开始。</span><button type="button" className="idea-text-button" onClick={() => useLibraryStore.getState().navigate('settings')}>去设置</button></div>}
          <footer className="idea-privacy-note">仅本份想法参与模型处理 · 手稿保存在本机资料库并随备份保存</footer>
        </section>
        {session ? <ManuscriptSheet key={session.id} session={session} busy={busy} /> : <aside className="idea-margin-note"><span className="idea-margin-line" /><p>不急着找到答案。<br />先看清，<br />问题从哪里生长。</p><span className="idea-margin-seal">一念</span></aside>}
      </div>
    </div>
  </main>
}
