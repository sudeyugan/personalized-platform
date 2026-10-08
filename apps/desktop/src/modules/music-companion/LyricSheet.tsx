import type { LyricExcerpt } from './lyrics'

export function LyricSheet({ excerpt, compact = false, paused = false }: { excerpt: LyricExcerpt; compact?: boolean; paused?: boolean }) {
  return <div className={'lyric-sheet' + (compact ? ' compact' : '') + (paused ? ' paused' : '')} aria-label="同步歌词">
    {!compact && <p className="lyric-context previous" aria-hidden="true">{excerpt.previous || '\u00a0'}</p>}
    <p className={'lyric-focus' + (!excerpt.current ? ' lyric-waiting' : '')} title={excerpt.current || undefined} key={`${excerpt.at}:${excerpt.current}`}>
      {excerpt.current || (excerpt.next ? '等下一句…' : '这一段，静静听')}
    </p>
    {!compact && <p className="lyric-context next" aria-hidden="true">{excerpt.next || '\u00a0'}</p>}
  </div>
}
