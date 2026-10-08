import { useCallback, useEffect, useRef, useState } from 'react'
import { lineIndexAt, type LyricLine } from '../lyrics'

export function LyricsReader({ lines, position, fontSize }: { lines: LyricLine[]; position: number; fontSize: number }) {
  const [following, setFollowing] = useState(true)
  const current = lineIndexAt(lines, position)
  const active = current >= 0 && position - lines[current].at <= 20_000 ? current : -1
  const container = useRef<HTMLDivElement>(null)
  const center = useCallback(() => {
    const element = container.current?.querySelector<HTMLElement>(`[data-line="${Math.max(0, current)}"]`)
    if (element && container.current) container.current.scrollTo?.({ top: Math.max(0, element.offsetTop - container.current.clientHeight / 2 + element.clientHeight / 2), behavior: 'auto' })
  }, [current])
  useEffect(() => { if (following) center() }, [center, following, fontSize, lines])
  const manual = () => setFollowing(false)
  return <section className="lyrics-reading">
    <div ref={container} className="lyrics-reading-lines" aria-label="整曲歌词" tabIndex={0} onWheel={manual} onTouchStart={manual} onPointerDown={manual} onKeyDown={(event) => { if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End'].includes(event.key)) manual() }}>
      {lines.length ? lines.map((line, index) => <p key={index} data-line={index} className={index === active ? 'current' : ''} aria-current={index === active ? 'true' : undefined}>{line.text}</p>) : <p className="lyrics-empty">还没有这首歌的同步歌词</p>}
    </div>
    {!following && <button className="lyrics-back" onClick={() => { setFollowing(true); center() }}>回到当前句</button>}
  </section>
}
