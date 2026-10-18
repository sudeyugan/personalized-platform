import { ArrowUpRight, Check, Pause } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { IDEA_LIMITS, type IdeaMode, type IdeaSession } from '../../domain/ideas/types'
import { InkGesture, InkText } from './InkText'
import { IdeaTrail } from './IdeaTrail'

export function IdeaThinkingScroll({ session, busy, error, reviewing, input, setInput, submit, cancel, reveal, finishReveal, beforeFork }: {
  session: IdeaSession; busy: boolean; error: string; reviewing: boolean
  input: string; setInput(value: string): void; submit(value: string, mode?: IdeaMode): void; cancel(): void
  reveal: boolean; finishReveal(): void; beforeFork(): void
}) {
  const frame = session.turns.at(-1)?.frame, turnId = session.turns.at(-1)?.id
  const heading = useRef<HTMLHeadingElement>(null), inputRef = useRef<HTMLTextAreaElement>(null)
  const previousId = useRef(turnId)
  useEffect(() => {
    if (previousId.current !== turnId) heading.current?.focus({ preventScroll: true })
    previousId.current = turnId
  }, [turnId])
  return <section className="idea-thinking" aria-label="想法推敲">
    <IdeaTrail session={session} busy={busy} beforeFork={beforeFork} />
    <article className="idea-round" data-composition={session.turns.length > 1 ? 'branching' : 'listening'}>
      <header className="idea-round-heading"><span className="idea-eyebrow">{session.status === 'collected' ? '暂成一稿 / 仍可继续' : `推敲 / 第 ${String(session.turns.length || 1).padStart(2, '0')} 折`}</span>{reveal && <button type="button" className="idea-text-button" onClick={finishReveal}>即刻读完</button>}</header>
      <div className="idea-source-note"><span className="idea-margin-label">你的落笔</span><blockquote>{session.turns.findLast(turn => turn.mode !== 'collect')?.input ?? session.seed}</blockquote></div>
      {frame ? <div className="idea-current-ink" key={turnId}>
        <div className="idea-reflection-block"><span className="idea-margin-label">接着想</span><p className="idea-reflection"><InkText text={frame.reflection} reveal={reveal} /></p></div>
        <div className="idea-question-block"><span className="idea-question-index" aria-hidden="true">{String(session.turns.length).padStart(2, '0')}</span><h2 ref={heading} tabIndex={-1} aria-label={session.status === 'collected' ? '先把这份想法，留在纸上。' : frame.question}><InkText text={session.status === 'collected' ? '先把这份想法，留在纸上。' : frame.question} reveal={reveal} offset={180} /></h2><InkGesture /></div>
        {session.status !== 'collected' && <div className="idea-options" aria-label="可以走的方向">{frame.options.map((option, index) => <button type="button" aria-label={`方向${index + 1}：${option}`} className={session.pending?.input === option ? 'is-chosen' : ''} key={option} disabled={busy} onClick={() => submit(option)}><span className="idea-option-number" aria-hidden="true">{['壹', '贰', '叁', '肆'][index]}</span><span className="idea-option-copy"><InkText text={option} reveal={reveal} offset={300 + index * 100} /></span><ArrowUpRight size={15} /></button>)}</div>}
        {!!frame.uncertainties.length && <details className="idea-margin-thought"><summary>尚未落定的几笔 <span>{frame.uncertainties.length}</span></summary><ul>{frame.uncertainties.map(text => <li key={text}>{text}</li>)}</ul></details>}
      </div> : !busy && <h2 ref={heading} tabIndex={-1}>从这一念，继续落笔。</h2>}
      {busy && <div className="idea-busy" role="status"><span className="idea-ink-drop" aria-hidden="true" /><span>{reviewing ? '等待你确认发送内容' : '正在接住你的想法…'}</span><button type="button" onClick={cancel} className="idea-text-button"><Pause size={13} /> 暂停</button></div>}
      {error && <p className="idea-error" role="alert">{error}</p>}
      {!busy && session.pending && <div className="idea-retry"><p>上次停在这里：{session.pending.input.slice(0, 140)}</p><button type="button" className="idea-text-button" onClick={() => submit(session.pending!.input, session.pending!.mode)}>继续这一轮 <ArrowUpRight size={14} /></button></div>}
      {frame && <form className="idea-response" onSubmit={event => { event.preventDefault(); submit(input) }}><div className="idea-response-heading"><span aria-hidden="true">续</span><label htmlFor="idea-response" className="idea-field-label">{session.status === 'collected' ? '还有想继续展开的地方吗？' : '也可以用自己的话，补上另一种可能'}</label></div><textarea ref={inputRef} id="idea-response" value={input} disabled={busy} onChange={event => setInput(event.target.value)} maxLength={IDEA_LIMITS.input} placeholder="不必沿着选项，写下你真正想说的……" rows={2} /><div className="idea-input-foot"><button type="button" className="idea-text-button" disabled={busy} onClick={() => { setInput('这些方向还不太贴切，我更想说的是：'); inputRef.current?.focus() }}>都不太贴切</button><button className="idea-primary" disabled={busy || !input.trim()} type="submit">继续推敲 <ArrowUpRight size={15} /></button></div></form>}
      {frame && !busy && <footer className="idea-round-footer">{session.status === 'collected' ? <button type="button" className="idea-text-button" onClick={() => submit('我想继续深化当前想法，请提出最值得进一步推敲的一个问题。')}>再往深处想想 <ArrowUpRight size={14} /></button> : <button type="button" className="idea-text-button" onClick={() => submit('请把目前的想法先整理成一份可用的手稿，保留仍未确定的部分，不替我作决定。', 'collect')}><Check size={14} /> 先整理到这里</button>}<span className="idea-footer-inscription">未定，也是一种进展。</span></footer>}
    </article>
  </section>
}
