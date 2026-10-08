import type { FortuneKind } from '../../domain/fortune'
import type { ThemedFortuneSign } from './themedSigns'
import { getFortuneTheme } from './themes'

export function FortunePaper({ kind, date, sign, guest = false }: { kind: FortuneKind; date: string; sign: ThemedFortuneSign; guest?: boolean }) {
  const theme = getFortuneTheme(kind)
  return <article className="fortune-paper" aria-label={`${theme.name}文`}>
    <div className="fortune-paper-top"><span>{guest ? '客签 · ' : ''}{theme.name} · 第 {String(sign.id).padStart(2, '0')} 签</span><small>{date.replaceAll('-', ' · ')}</small></div>
    <p className="fortune-paper-caption">{theme.caption}</p><div className="fortune-seal">{sign.grade}</div><h2>{sign.title}</h2>
    <p className="fortune-poem">{sign.poem.split('，').map((line, index) => <span key={index}>{line}</span>)}</p>
    {kind !== 'daily' && <p className="fortune-paper-meaning">{sign.meaning}</p>}
    <dl className="fortune-interpretation">{sign.entries.map((entry) => <div key={entry.label}><dt>{entry.label}</dt><dd>{entry.text}</dd></div>)}</dl>
    <footer>{guest ? '赠予来客 · 本次不留存' : '一纸偶然，不替你决定。'}</footer>
  </article>
}
