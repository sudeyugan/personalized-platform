import { ArrowUpRight, GitBranch } from 'lucide-react'
import { useState } from 'react'
import type { IdeaTurn } from '../../domain/ideas/types'
import { InkGesture, InkText } from './InkText'

export function IdeaScrollChapter({ turn, index, previous, active, chosen, busy, reveal, submit, finishReveal, fork }: {
  turn: IdeaTurn; index: number; previous?: IdeaTurn; active: boolean; chosen?: string; busy: boolean; reveal: boolean
  submit(value: string): void; finishReveal(): void; fork(): void
}) {
  const [folded, setFolded] = useState(false)
  const { frame } = turn
  return <article className={`idea-scroll-chapter${active ? ' is-current' : ' is-written'}`} data-turn-id={turn.id} data-composition={index % 2 ? 'branching' : 'listening'}>
    <header className="idea-round-heading"><span className="idea-eyebrow">{turn.mode === 'collect' ? '暂成一稿' : '推敲'} / 第 {String(index + 1).padStart(2, '0')} 折</span><div>{reveal && <button type="button" className="idea-text-button" onClick={finishReveal}>即刻读完</button>}<button type="button" className="idea-text-button" aria-expanded={!folded} onClick={() => setFolded(!folded)}>{folded ? '展开这一折' : '收起这一折'}</button></div></header>
    <div hidden={folded}>
      <div className="idea-source-note"><span className="idea-margin-label">{turn.mode === 'collect' ? '这一折 · 整理请求' : '你的落笔'}</span><blockquote>{turn.input}</blockquote></div>
      <div className="idea-reflection-block"><span className="idea-margin-label">接着想</span><p className="idea-reflection"><InkText text={frame.reflection} reveal={reveal} /></p></div>
      <div className="idea-question-block"><span className="idea-question-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><h2 tabIndex={-1} aria-label={turn.mode === 'collect' ? '先把这份想法，留在纸上。' : frame.question}><InkText text={turn.mode === 'collect' ? '先把这份想法，留在纸上。' : frame.question} reveal={reveal} offset={120} /></h2><InkGesture /></div>
      {turn.mode !== 'collect' && <div className={`idea-options${!active || chosen ? ' idea-written-options' : ''}`} aria-label="可以走的方向">{frame.options.map((option, optionIndex) => active
        ? <button type="button" aria-label={`方向${optionIndex + 1}：${option}`} className={chosen === option ? 'is-chosen' : ''} key={option} disabled={busy} onClick={() => submit(option)}><span className="idea-option-number" aria-hidden="true">{['壹', '贰', '叁', '肆'][optionIndex]}</span><span className="idea-option-copy"><InkText text={option} reveal={reveal} offset={180} /></span><ArrowUpRight size={15} /></button>
        : <div key={option} className={`idea-written-direction${chosen === option ? ' is-chosen' : ''}`}><span className="idea-option-number" aria-hidden="true">{['壹', '贰', '叁', '肆'][optionIndex]}</span><span>{option}</span>{chosen === option && <small>此路续笔</small>}</div>)}</div>}
      {!!frame.uncertainties.length && <details className="idea-margin-thought"><summary>尚未落定的几笔 <span>{frame.uncertainties.length}</span></summary><ul>{frame.uncertainties.map(text => <li key={text}>{text}</li>)}</ul></details>}
      {turn.mode === 'collect' && <div className="idea-collected-note"><p>{frame.nextStep}</p><span className="idea-caption">整理已留在成稿，仍可继续推敲。</span></div>}
      <details className="idea-chapter-notes"><summary>这一折的来路与修订</summary>
        {chosen && frame.options.includes(chosen) && <p className="idea-history-choice">当时选择 · {chosen}</p>}
        {previous && previous.frame.manuscript !== frame.manuscript && <details className="idea-revision"><summary>这一折的整理变化 · 模型暂稿</summary><div><section><small>此前</small><p>{previous.frame.manuscript}</p></section><section><small>此刻</small><p>{frame.manuscript}</p></section></div></details>}
        <button type="button" className="idea-text-button" disabled={busy} onClick={fork}><GitBranch size={13} /> 从这里另开一条思路</button>
      </details>
    </div>
    {folded && <p className="idea-folded-title">{frame.question}</p>}
  </article>
}
