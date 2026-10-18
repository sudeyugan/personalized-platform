import { GitBranch } from 'lucide-react'
import type { IdeaSession } from '../../domain/ideas/types'
import { InkGesture } from './InkText'
import { useLibraryStore } from '../../state/useLibraryStore'

export function IdeaTrail({ session, busy, beforeFork }: { session: IdeaSession; busy: boolean; beforeFork(): void }) {
  if (!session.turns.length) return null
  return <details className="idea-trail">
    <summary><span className="idea-trail-fold" aria-hidden="true" /><span>回看与改选</span><small>{session.turns.length} 折来路</small><InkGesture kind="fold" /></summary>
    <section aria-label="思考来路" className="idea-history">
      <p className="idea-caption">原话与当时的推敲都留着。从任何一折另起，不改动原稿。</p>
      {session.turns.map((turn, index) => {
        const next = session.turns[index + 1]
        const selected = next && turn.frame.options.includes(next.input) ? next.input : undefined
        const previous = session.turns[index - 1]
        return <article key={turn.id}>
          <header><span className="idea-eyebrow">第 {String(index + 1).padStart(2, '0')} 折</span><span>{turn.mode === 'collect' ? '暂成一稿' : '推敲'}</span></header>
          <blockquote>{turn.input}</blockquote><p className="idea-history-question">{turn.frame.question}</p>
          {selected && <p className="idea-history-choice">当时选择 · {selected}</p>}
          {next && <details className="idea-old-directions"><summary>当时的其他方向</summary><ul>{turn.frame.options.filter(option => option !== selected).map(option => <li key={option}>{option}</li>)}</ul></details>}
          {previous && previous.frame.manuscript !== turn.frame.manuscript && <details className="idea-revision"><summary>这一折的整理变化 · 模型暂稿</summary><div><section><small>此前</small><p>{previous.frame.manuscript}</p></section><section><small>此刻</small><p>{turn.frame.manuscript}</p></section></div></details>}
          <button type="button" className="idea-text-button" disabled={busy} onClick={() => { beforeFork(); useLibraryStore.getState().forkIdea(session.id, index) }}><GitBranch size={13} /> 从这里另开一条思路</button>
        </article>
      })}
    </section>
  </details>
}
