import { BookOpen, Bookmark, BookmarkCheck, Feather, PenLine, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLibraryStore } from '../../state/useLibraryStore'
import { answerBookAnswers } from './answers'

type RevealPhase = 'idle' | 'turning' | 'revealed'

function drawRandomAnswer() {
  const random = new Uint32Array(1)
  crypto.getRandomValues(random)
  return answerBookAnswers[Math.floor((random[0] / 2 ** 32) * answerBookAnswers.length)]
}

function formatFavoriteTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function AnswerBookView() {
  const { data, addAnswerBookFavorite, deleteAnswerBookFavorite } = useLibraryStore()
  const [question, setQuestion] = useState('')
  const [answeredQuestion, setAnsweredQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [phase, setPhase] = useState<RevealPhase>('idle')
  const [favoriteSaved, setFavoriteSaved] = useState(false)
  const revealTimer = useRef<number | undefined>(undefined)
  const questionInput = useRef<HTMLTextAreaElement>(null)

  useEffect(() => () => window.clearTimeout(revealTimer.current), [])

  const revealAnswer = () => {
    const cleanQuestion = question.trim()
    if (!cleanQuestion || phase !== 'idle') return
    window.clearTimeout(revealTimer.current)
    setPhase('turning')
    setFavoriteSaved(false)
    setAnsweredQuestion(cleanQuestion)
    const revealDelay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 160 : 1380
    revealTimer.current = window.setTimeout(() => {
      setAnswer(drawRandomAnswer())
      setPhase('revealed')
    }, revealDelay)
  }

  const saveFavorite = () => {
    if (!answer || !answeredQuestion || favoriteSaved) return
    addAnswerBookFavorite({ question: answeredQuestion, answer })
    setFavoriteSaved(true)
  }

  const startNewQuestion = () => {
    window.clearTimeout(revealTimer.current)
    setQuestion('')
    setAnsweredQuestion('')
    setAnswer('')
    setFavoriteSaved(false)
    setPhase('idle')
    window.requestAnimationFrame(() => questionInput.current?.focus())
  }

  return (
    <main className="answer-book-view scroll-view">
      <header className="answer-book-header">
        <p className="eyebrow">答案之书</p>
        <h1>把问题交给偶然</h1>
        <p>在心里安静地想一遍。每次翻开，只回答这一个问题。</p>
      </header>

      <div className="answer-book-layout">
        <section className="answer-ritual" aria-label="抽取答案">
          <div className="answer-ornament" aria-hidden="true"><span /><Sparkles size={16} /><span /></div>
          <label className="answer-question">
            <span>此刻，你想问什么？</span>
            <textarea
              maxLength={240}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') revealAnswer()
              }}
              placeholder="写下一个可以被温柔回应的问题……"
              readOnly={phase !== 'idle'}
              ref={questionInput}
              value={question}
            />
            <small>{question.length}/240 · Ctrl + Enter 翻开</small>
          </label>

          <div className={`answer-page ${phase}`} aria-live="polite">
            <div className="answer-page-edge" aria-hidden="true" />
            {phase === 'turning' && <div className="answer-turning-leaf" aria-hidden="true"><i /><i /><i /></div>}
            {phase === 'idle' && (
              <div className="answer-page-prompt">
                <BookOpen size={38} strokeWidth={1.2} />
                <span>答案尚未落笔</span>
              </div>
            )}
            {phase === 'turning' && (
              <div className="answer-page-prompt">
                <Feather size={34} strokeWidth={1.2} />
                <span>书页正在回应……</span>
              </div>
            )}
            {phase === 'revealed' && (
              <div className="answer-page-copy">
                <span className="answer-seal">隅</span>
                <blockquote>{answer}</blockquote>
                <p>— 此刻翻到的答案 —</p>
              </div>
            )}
          </div>

          <div className="answer-actions">
            {phase !== 'revealed' && (
              <button className="answer-reveal-button" disabled={!question.trim() || phase === 'turning'} onClick={revealAnswer} type="button">
                <BookOpen size={17} />
                {phase === 'idle' ? '翻开答案' : '正在翻页'}
              </button>
            )}
            {phase === 'revealed' && (
              <>
                <button className={favoriteSaved ? 'answer-favorite-button saved' : 'answer-favorite-button'} disabled={favoriteSaved} onClick={saveFavorite} type="button">
                  {favoriteSaved ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}
                  {favoriteSaved ? '已收藏这一页' : '收藏这一页'}
                </button>
                <button className="answer-new-question-button" onClick={startNewQuestion} type="button"><PenLine size={17} />写下新问题</button>
              </>
            )}
          </div>
          <p className="answer-disclaimer">同一个问题不能重新抽取；写下新问题时会翻开新的一页。答案仅在本地随机产生，不会发送、分析或自动保存。</p>
        </section>

        <aside className="answer-favorites" aria-label="收藏的答案">
          <header>
            <div><p className="eyebrow">留存书页</p><h2>我的收藏</h2></div>
            <span>{data.answerBook.favorites.length}</span>
          </header>
          {data.answerBook.favorites.length === 0 ? (
            <div className="answer-favorites-empty">
              <Bookmark size={26} strokeWidth={1.2} />
              <p>收藏的答案会留在这里。</p>
              <span>未收藏的问题不会被保存。</span>
            </div>
          ) : (
            <div className="answer-favorite-list">
              {data.answerBook.favorites.map((favorite) => (
                <article key={favorite.id}>
                  <button aria-label="删除这条收藏" onClick={() => deleteAnswerBookFavorite(favorite.id)} title="删除收藏" type="button"><Trash2 size={14} /></button>
                  <small>{formatFavoriteTime(favorite.createdAt)}</small>
                  <p>{favorite.question}</p>
                  <blockquote>{favorite.answer}</blockquote>
                </article>
              ))}
            </div>
          )}
        </aside>
      </div>
    </main>
  )
}
