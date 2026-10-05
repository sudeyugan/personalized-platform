import { useEffect, useRef, useState } from 'react'
import { useLibraryStore } from '../../state/useLibraryStore'
import { formatLocalDate } from '../../domain/localDate'
import { fortuneSigns } from './signs'
import './fortune.css'

export function FortuneView() {
  const today = useLibraryStore((store) => store.data.fortune?.today)
  const draw = useLibraryStore((store) => store.drawFortune)
  const [date, setDate] = useState(formatLocalDate)
  const [phase, setPhase] = useState<'ready' | 'shaking' | 'stick' | 'paper'>(() => today?.date === formatLocalDate() ? 'paper' : 'ready')
  const timer = useRef<number | undefined>(undefined)
  const locked = useRef(false)
  useEffect(() => {
    const checkDate = () => setDate(formatLocalDate())
    const interval = window.setInterval(checkDate, 30_000)
    window.addEventListener('focus', checkDate)
    return () => { window.clearInterval(interval); window.clearTimeout(timer.current); window.removeEventListener('focus', checkDate) }
  }, [])
  useEffect(() => { if (today?.date !== date && !locked.current) setPhase('ready') }, [date, today?.date])
  const sign = today?.date === date ? fortuneSigns.find((item) => item.id === today.signId) : undefined
  const begin = () => {
    if (locked.current) return
    locked.current = true
    setDate(formatLocalDate())
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      draw(); setPhase('paper'); locked.current = false; return
    }
    setPhase('shaking')
    timer.current = window.setTimeout(() => {
      draw(); setPhase('stick')
      timer.current = window.setTimeout(() => { setPhase('paper'); locked.current = false }, 650)
    }, 1050)
  }
  return <main className="fortune-view" aria-labelledby="fortune-title">
    <div className="fortune-mist" aria-hidden="true" />
    <header className="fortune-intro"><p>一 隅 · 心 签</p><h1 id="fortune-title">一隅签</h1><span>不问定数，借一纸偶然，照见此刻。</span></header>
    <section className={`fortune-ritual ${phase}`} aria-label="抽签仪式" aria-busy={phase === 'shaking' || phase === 'stick'}>
      {phase !== 'paper' && <div className="fortune-cylinder-scene">
        <div className="fortune-branch" aria-hidden="true">✧</div>
        <div className="fortune-sticks" aria-hidden="true"><i /><i /><i /><i /><i /></div>
        <div className="fortune-cylinder" aria-hidden="true"><span>御<br />心<br />签</span><b>一 隅</b></div>
        {phase === 'stick' && sign && <div className="fortune-drawn-stick" aria-hidden="true">第 {sign.id} 签</div>}
        <p className="fortune-whisper" role="status">{phase === 'shaking' ? '让念头静下来，让偶然落在手中。' : phase === 'stick' ? '一支签，正为你展开。' : '在心里留一个念头，然后轻轻摇签。'}</p>
      </div>}
      {phase === 'paper' && sign && <article className="fortune-paper" key={`${date}-${sign.id}`} aria-label="今日签文">
        <div className="fortune-paper-top"><span>第 {String(sign.id).padStart(2, '0')} 签</span><small>{date.replaceAll('-', ' · ')}</small></div>
        <div className="fortune-seal">{sign.grade}</div><h2>{sign.title}</h2>
        <p className="fortune-poem">{sign.poem}</p>
        <div className="fortune-interpretation"><span>签 意</span><p>{sign.meaning}</p><span>今 日 一 念</span><p>{sign.advice}</p></div>
        <footer>一纸偶然，不替你决定。</footer>
      </article>}
    </section>
    <div className="fortune-actions">
      {phase === 'ready' && <button onClick={begin}>轻摇签筒 <span>↗</span></button>}
      {phase === 'paper' && sign && <small>今日的签已留在这里，回来仍可查看。明天，再与偶然相遇。</small>}
    </div>
    <p className="fortune-footnote">本地原创生活签 · 无需写下心事 · 不是现实预测</p>
  </main>
}
