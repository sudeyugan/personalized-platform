import { useState } from 'react'
import {
  chooseFortune,
  FORTUNE_KEYS,
  normalizeFortunes,
  type FortuneKind,
} from '../../../desktop/src/domain/fortune'
import { fortuneThemes, getFortuneSign } from '../../../desktop/src/modules/fortune/themes'
import { FortunePaper } from '../../../desktop/src/modules/fortune/FortunePaper'
import { FortuneCylinder } from '../../../desktop/src/modules/fortune/FortuneCylinder'
import { drawRandomAnswer } from '../../../desktop/src/modules/answer-book/drawAnswer'
import { truthQuestions } from '../../../desktop/src/modules/truth/questions'
import { shuffledTruthDeck } from '../../../desktop/src/modules/truth/truthDeck'
import { today } from '../data'
import '../../../desktop/src/modules/fortune/fortune.css'
import '../../../desktop/src/modules/fortune/fortuneThemes.css'
const fortuneKey = 'yiyu.mobile.fortune.v1'
export default function RitualPage() {
  const [tab, setTab] = useState('fortune'),
    [kind, setKind] = useState<FortuneKind>('daily'),
    [guest, setGuest] = useState(false)
  const [fortunes, setFortunes] = useState(() => {
    try {
      return normalizeFortunes(JSON.parse(localStorage.getItem(fortuneKey) ?? '{}'))
    } catch {
      return {}
    }
  })
  const [guestSign, setGuestSign] = useState<number>(),
    [question, setQuestion] = useState(''),
    [answer, setAnswer] = useState(''),
    [error, setError] = useState('')
  const [deck, setDeck] = useState(() => ({ cards: shuffledTruthDeck(), position: -1 }))
  const saved = fortunes[FORTUNE_KEYS[kind]],
    sign = getFortuneSign(kind, guest ? (guestSign ?? 0) : saved?.date === today() ? saved.signId : 0)
  const draw = () => {
    const next = chooseFortune(guest ? undefined : saved, today(), Math.random, kind)
    if (guest) {
      setGuestSign(next.signId)
      return
    }
    try {
      const value = { ...fortunes, [FORTUNE_KEYS[kind]]: next }
      localStorage.setItem(fortuneKey, JSON.stringify(value))
      setFortunes(value)
      setError('')
    } catch {
      setError('今日签未能保存，请暂勿关闭。')
    }
  }
  return (
    <section className="mobile-ritual">
      <p className="eyebrow">不问定数，留一点偶然</p>
      <h1>片刻，安放自己。</h1>
      <div className="segments">
        {[
          ['fortune', '一隅签'],
          ['answer', '答案之书'],
          ['truth', '真心话'],
        ].map(([id, label]) => (
          <button aria-pressed={tab === id} key={id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'fortune' ? (
        <div className={`fortune-view fortune-${kind}`}>
          <div className="segments">
            {fortuneThemes.map((theme) => (
              <button
                key={theme.kind}
                aria-pressed={kind === theme.kind}
                onClick={() => {
                  setKind(theme.kind)
                  setGuestSign(undefined)
                }}
              >
                {theme.name}
              </button>
            ))}
          </div>
          <label className="check-label">
            <input
              type="checkbox"
              checked={guest}
              onChange={(event) => {
                setGuest(event.target.checked)
                setGuestSign(undefined)
              }}
            />
            替别人抽，不留记录
          </label>
          {sign ? (
            <FortunePaper kind={kind} sign={sign} date={today()} guest={guest} />
          ) : (
            <div className="mobile-cylinder">
              <FortuneCylinder kind={kind} />
            </div>
          )}
          {(!sign || guest) && (
            <button className="primary" onClick={draw}>
              {sign ? '再请一位来客' : '轻摇签筒'}
            </button>
          )}
          <p className="footnote">
            与电脑共用原始签库和每日规则；本机每日结果暂不跨设备同步。中文原创心签，不是现实预测。
          </p>
        </div>
      ) : tab === 'answer' ? (
        <div className="answer-paper paper-card">
          <span className="seal">答</span>
          <label>
            此刻想问什么
            <textarea
              value={question}
              maxLength={240}
              disabled={Boolean(answer)}
              onChange={(event) => setQuestion(event.target.value)}
            />
          </label>
          {answer && <blockquote>{answer}</blockquote>}
          <button
            disabled={!question.trim() && !answer}
            className="primary"
            onClick={() => {
              if (answer) {
                setAnswer('')
                setQuestion('')
              } else setAnswer(drawRandomAnswer())
            }}
          >
            {answer ? '写下新问题' : '翻开一页'}
          </button>
          <p className="footnote">本地随机，不联网，不保存问题。</p>
        </div>
      ) : (
        <div className="truth-paper paper-card">
          <small>一隅 · 私语集</small>
          <blockquote>
            {deck.position < 0 ? '把偶然翻开，把真心留下。' : truthQuestions[deck.cards[deck.position]]}
          </blockquote>
          <button
            className="primary"
            onClick={() =>
              setDeck((current) =>
                current.position + 1 < current.cards.length
                  ? { ...current, position: current.position + 1 }
                  : { cards: shuffledTruthDeck(current.cards.at(-1)), position: 0 },
              )
            }
          >
            {deck.position < 0 ? '翻开一张' : '下一张'}
          </button>
          <p className="footnote">150 个问题 · 本轮不重复 · 不收集回答</p>
        </div>
      )}
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
    </section>
  )
}
