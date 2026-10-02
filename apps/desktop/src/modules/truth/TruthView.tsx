import { ArrowRight, Feather } from 'lucide-react'
import { useState } from 'react'
import { truthQuestions } from './questions'
import { shuffledTruthDeck } from './truthDeck'
import './truth.css'

function ThreadArt() {
  return <svg className="truth-thread-art" viewBox="0 0 260 300" fill="none" aria-hidden="true">
    <ellipse cx="130" cy="150" rx="83" ry="112" />
    <ellipse cx="130" cy="150" rx="68" ry="100" transform="rotate(27 130 150)" />
    <ellipse cx="130" cy="150" rx="68" ry="100" transform="rotate(-27 130 150)" />
    <path d="M130 244C122 201 49 172 60 114C67 73 110 77 130 112C150 77 193 73 200 114C211 172 138 201 130 244Z" />
    <path d="M82 242C101 221 115 209 130 191C145 173 147 154 130 137C113 120 114 96 130 58" />
    <path d="M178 242C159 221 145 209 130 191C115 173 113 154 130 137C147 120 146 96 130 58" />
    <circle cx="130" cy="38" r="3" /><circle cx="130" cy="262" r="3" />
  </svg>
}

export function TruthView() {
  const [round, setRound] = useState(() => ({ deck: shuffledTruthDeck(), position: -1, number: 1 }))
  const revealed = round.position >= 0
  const questionIndex = revealed ? round.deck[round.position] : undefined
  const question = questionIndex === undefined ? '' : truthQuestions[questionIndex]
  const advance = () => setRound((current) => current.position + 1 < current.deck.length
    ? { ...current, position: current.position + 1 }
    : { deck: shuffledTruthDeck(current.deck.at(-1)), position: 0, number: current.number + 1 })

  return <main className="truth-view" aria-labelledby="truth-title">
    <div className="truth-atmosphere" aria-hidden="true"><i /><i /><i /></div>
    <header className="truth-header">
      <span className="truth-eyebrow">一隅 · 私语集</span>
      <h1 id="truth-title">真心话<span>那些，没说出口的事。</span></h1>
      <p>借一个问题，让彼此靠近一点。</p>
    </header>
    <section className="truth-salon" aria-label="真心话抽卡">
      <div className="truth-side-note" aria-hidden="true"><span>不必急着回答</span><i /><small>留一点时间给真心</small></div>
      <div className="truth-deck">
        <div className="truth-stacked-card" aria-hidden="true" />
        <div className={revealed ? 'truth-card turned' : 'truth-card'}>
          <div className="truth-card-back" aria-hidden={revealed}>
            <div className="truth-card-border" />
            <span className="truth-card-edition">THE UNSPOKEN · 150</span>
            <ThreadArt />
            <div className="truth-back-title"><span>真</span><span>心</span><span>话</span></div>
            <p>把偶然翻开，把真心留下。</p>
            <span className="truth-card-star">✧</span>
          </div>
          <div className="truth-card-front" aria-hidden={!revealed}>
            <div className="truth-card-border" />
            <header><span>一张真心话</span><span>{questionIndex === undefined ? '—' : String(questionIndex + 1).padStart(3, '0')}</span></header>
            <span className="truth-front-ornament" aria-hidden="true">✧</span>
            <div className="truth-question" key={`${round.number}-${round.position}`}><blockquote>{question}</blockquote></div>
            <footer><span>说多少，都由你。</span><Feather size={18} strokeWidth={1} aria-hidden="true" /></footer>
          </div>
        </div>
      </div>
      <div className="truth-side-note truth-side-note-right" aria-hidden="true"><span>只在此刻发生</span><i /><small>不留下回答的痕迹</small></div>
    </section>
    <div className="truth-controls">
      <button type="button" className="truth-draw" onClick={advance}>{revealed ? '下一张' : '翻开一张'}<ArrowRight size={16} strokeWidth={1.4} aria-hidden="true" /></button>
      {revealed && <button type="button" className="truth-skip" onClick={advance}>这题先跳过</button>}
    </div>
    <p className="truth-progress" role="status">{revealed ? `第 ${round.number} 轮 · 已翻开 ${round.position + 1} / ${truthQuestions.length} 张` : '150 个问题 · 本轮不重复'}</p>
    <p className="truth-accessible-question" role="status" aria-live="polite" aria-atomic="true">{question}</p>
    <footer className="truth-page-footer"><span>适合两个人，也适合一桌朋友。</span><span>不记录回答 · 无需联网</span></footer>
  </main>
}
