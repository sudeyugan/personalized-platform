import type { FortuneKind } from '../../domain/fortune'
import { getFortuneTheme } from './themes'

export function FortuneCylinder({ kind, compact = false }: { kind: FortuneKind; compact?: boolean }) {
  const theme = getFortuneTheme(kind)
  return <div className={`fortune-vessel fortune-${kind}${compact ? ' compact' : ''}`} aria-hidden="true">
    <div className="fortune-sticks"><i /><i /><i /><i /><i /></div>
    <div className="fortune-cylinder"><span>{theme.name.split('').map((letter, index) => <span key={index}>{letter}</span>)}</span>
      <b>一 隅</b><i className="fortune-cylinder-mark">{theme.glyph}</i>
      {kind === 'love' && <svg className="fortune-cord" viewBox="0 0 128 60"><path d="M0 13Q64 30 128 13M64 21C31 2 39 47 64 21C94 0 98 46 64 21M64 21Q54 37 49 56M64 21Q69 42 78 52" /></svg>}
      {kind === 'future' && <svg className="fortune-bamboo-mark" viewBox="0 0 25 60"><path d="M10 56V5M9 16h4M9 32h4M9 48h4M11 21Q21 8 22 19Q17 24 11 21M11 36Q0 22 1 36Q5 40 11 36" /></svg>}
    </div>
  </div>
}
