import { FORTUNE_KEYS, type FortuneData, type FortuneKind } from '../../domain/fortune'
import { FortuneCylinder } from './FortuneCylinder'
import { fortuneThemes, getFortuneSign } from './themes'

export function FortuneTable({ date, fortune, guest = false, onSelect }: { date: string; fortune?: FortuneData; guest?: boolean; onSelect: (kind: FortuneKind) => void }) {
  return <section className="fortune-table" aria-label="三筒签台">
    <p className="fortune-table-caption">心中所念，择一筒轻问</p>
    <div className="fortune-table-row">{fortuneThemes.map((theme) => {
      const saved = fortune?.[FORTUNE_KEYS[theme.kind]]
      const drawn = !guest && saved?.date === date && getFortuneSign(theme.kind, saved.signId)
      return <button className={`fortune-table-choice fortune-${theme.kind}`} key={theme.kind} onClick={() => onSelect(theme.kind)} aria-label={`${drawn ? '查看' : '求'}${theme.name}`}>
        <FortuneCylinder kind={theme.kind} compact />
        <span className="fortune-choice-title">{theme.name}</span><span className="fortune-choice-note">{theme.note}</span>
        <span className="fortune-choice-state">{drawn ? '今日签已留 · 查看' : '轻选此筒'}</span>
      </button>
    })}</div>
    <div className="fortune-table-wood" aria-hidden="true" />
    <p className="fortune-table-hint">{guest ? '客签不留存，只赠此刻的偶然。' : '每筒每日一签，心事不必写下。'}</p>
  </section>
}
