import { FortuneArtwork } from './FortuneArtwork'
import { FortuneCylinder } from './FortuneCylinder'
import { FortuneTable } from './FortuneTable'
import { FortunePaper } from './FortunePaper'
import { useFortuneRitual } from './useFortuneRitual'
import { getFortuneTheme } from './themes'
import './fortune.css'
import './fortuneThemes.css'

export function FortuneView() {
  const { date, kind, guest, phase, sign, fortune, select, back, begin, changeRecipient, nextGuest, busy } = useFortuneRitual()
  const theme = kind ? getFortuneTheme(kind) : undefined
  return <main className={`fortune-view fortune-${kind ?? 'daily'}`} aria-labelledby="fortune-title">
    <div className="fortune-mist" aria-hidden="true" /><FortuneArtwork kind={kind} />
    <header className="fortune-intro"><p>一 隅 · 心 签</p><h1 id="fortune-title">{theme?.name ?? '一隅签'}</h1><span>不问定数，借一纸偶然，照见此刻。</span></header>
    <div className="fortune-recipient" role="group" aria-label="为谁抽签">
      <button aria-pressed={!guest} disabled={busy} onClick={() => changeRecipient(false)}>为自己求签</button>
      <button aria-pressed={guest} disabled={busy} onClick={() => changeRecipient(true)}>替别人抽</button>
    </div>
    <p className="fortune-recipient-note">{guest ? '一支客签，赠予此刻来访的人。不留记录，不占你的每日签。' : '每日一签，留给自己；也可邀请来访的人抽一支客签。'}</p>
    {!kind ? <FortuneTable date={date} fortune={fortune} guest={guest} onSelect={select} /> : <>
      <section className={`fortune-ritual ${phase}`} aria-label="抽签仪式" aria-busy={busy}>
        {phase !== 'paper' && <div className="fortune-cylinder-scene">
          <div className="fortune-halo" aria-hidden="true" /><div className="fortune-plinth" aria-hidden="true" />
          <FortuneCylinder kind={kind} />
          {phase === 'stick' && sign && <div className="fortune-drawn-stick" aria-hidden="true">第 {sign.id} 签</div>}
          <p className="fortune-whisper" role="status">{phase === 'shaking' ? '让念头静下来，让偶然落在手中。' : phase === 'stick' ? '一支签，正为你展开。' : '在心里留一个念头，然后轻轻摇签。'}</p>
        </div>}
        {phase === 'paper' && sign && <FortunePaper key={`${kind}-${date}-${sign.id}`} kind={kind} date={date} sign={sign} guest={guest} />}
      </section>
      <div className="fortune-actions">
        {phase === 'ready' && <button onClick={begin}>轻摇签筒 <span>↗</span></button>}
        {phase === 'paper' && sign && (guest ? <><small>这一纸只赠来客，离开后不保留。你的每日签未改变。</small><button className="fortune-next-guest" onClick={nextGuest}>再请一位来客</button></> : <small>这筒今日的签已留在这里，回来仍可查看。<br />也可以回签台，轻问另一筒。</small>)}
        <button className="fortune-back" onClick={back} disabled={busy}>← 回到签台</button>
      </div>
    </>}
    <p className="fortune-footnote">本地原创心签 · 无需写下心事 · 不是现实预测</p>
  </main>
}
