import { ArrowUpRight, Check } from 'lucide-react'
import { useRef } from 'react'
import { IDEA_LIMITS, type IdeaMode, type IdeaSession } from '../../domain/ideas/types'
import { useLibraryStore } from '../../state/useLibraryStore'
import { IdeaScrollChapter } from './IdeaScrollChapter'
import { InkWaiting } from './InkWaiting'

export function IdeaThinkingScroll({ session, busy, error, reviewing, input, setInput, submit, cancel, reveal, finishReveal, beforeFork }: {
  session: IdeaSession; busy: boolean; error: string; reviewing: boolean
  input: string; setInput(value: string): void; submit(value: string, mode?: IdeaMode): void; cancel(): void
  reveal: boolean; finishReveal(): void; beforeFork(): void
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null), frame = session.turns.at(-1)?.frame
  return <section className="idea-thinking" aria-label="想法推敲">
    <div className="idea-continuous-scroll">{session.turns.map((turn, index) => <IdeaScrollChapter key={turn.id} turn={turn} index={index} previous={session.turns[index - 1]} active={index === session.turns.length - 1} busy={busy} chosen={session.turns[index + 1]?.input ?? session.pending?.input} reveal={reveal && index === session.turns.length - 1} submit={submit} finishReveal={finishReveal} fork={() => { beforeFork(); useLibraryStore.getState().forkIdea(session.id, index) }} />)}</div>
    {(busy || session.pending) && <div className="idea-pending-chapter" data-scroll-arrival>
      <div className="idea-source-note"><span className="idea-margin-label">{session.pending?.mode === 'collect' ? '准备收束' : '你的续笔'}</span><blockquote>{session.pending?.input ?? session.seed}</blockquote></div>
      {busy && <InkWaiting reviewing={reviewing} cancel={cancel} />}
      {!busy && session.pending && <div className="idea-retry"><span className="idea-caption">墨停在这里，原稿仍在。</span><button type="button" className="idea-text-button" onClick={() => submit(session.pending!.input, session.pending!.mode)}>继续这一轮 <ArrowUpRight size={14} /></button></div>}
    </div>}
    {error && <p className="idea-error" role="alert">{error}</p>}
    {frame && <form className="idea-response" onSubmit={event => { event.preventDefault(); submit(input) }}><div className="idea-response-heading"><span aria-hidden="true">续</span><label htmlFor="idea-response" className="idea-field-label">{session.status === 'collected' ? '还有想继续展开的地方吗？' : '也可以用自己的话，补上另一种可能'}</label></div><textarea ref={inputRef} id="idea-response" value={input} disabled={busy} onChange={event => setInput(event.target.value)} maxLength={IDEA_LIMITS.input} placeholder="不必沿着选项，写下你真正想说的……" rows={2} /><div className="idea-input-foot"><button type="button" className="idea-text-button" disabled={busy} onClick={() => { setInput('这些方向还不太贴切，我更想说的是：'); inputRef.current?.focus() }}>都不太贴切</button><button className="idea-primary" disabled={busy || !input.trim()} type="submit">继续推敲 <ArrowUpRight size={15} /></button></div></form>}
    {frame && !busy && <footer className="idea-round-footer">{session.status === 'collected' ? <button type="button" className="idea-text-button" onClick={() => submit('我想继续深化当前想法，请提出最值得进一步推敲的一个问题。')}>再往深处想想 <ArrowUpRight size={14} /></button> : <button type="button" className="idea-text-button" onClick={() => submit('请把目前的想法先整理成一份可用的手稿，保留仍未确定的部分，不替我作决定。', 'collect')}><Check size={14} /> 先整理到这里</button>}<span className="idea-footer-inscription">未定，也是一种进展。</span></footer>}
  </section>
}
