export interface LyricLine { at: number; text: string }
export function parseLrc(source: string): LyricLine[] {
  if (source.length > 200_000) throw new Error('歌词文件过大，请选择200KB以内的LRC')
  const offset = Number(/\[offset:([+-]?\d+)\]/i.exec(source)?.[1] ?? 0)
  const lines: LyricLine[] = []
  for (const raw of source.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)]
    const text = raw.replace(/\[[^\]]*\]/g, '').trim().slice(0, 300)
    if (!text) continue
    for (const stamp of stamps) {
      if (Number(stamp[2]) >= 60) continue
      const fraction = Number(('0.' + (stamp[3] ?? '0')))
      const at = (Number(stamp[1]) * 60 + Number(stamp[2]) + fraction) * 1000 + offset
      if (Number.isFinite(at) && at <= 14_400_000) lines.push({ at: Math.max(0, at), text })
      if (lines.length > 5000) throw new Error('歌词行数过多')
    }
  }
  return lines.sort((left, right) => left.at - right.at)
}
export function lineIndexAt(lines: LyricLine[], position: number) {
  if (!Number.isFinite(position)) return -1
  let low = 0, high = lines.length - 1, match = -1
  while (low <= high) { const mid = (low + high) >>> 1; if (lines[mid].at <= position) { match = mid; low = mid + 1 } else high = mid - 1 }
  return match
}
export function lyricAt(lines: LyricLine[], position: number) {
  return lyricExcerptAt(lines, position).current
}
export interface LyricExcerpt { previous: string; current: string; next: string; at: number | null }
// The character badge only receives excerpts. A dedicated reader can receive
// the current song separately, never the whole lyric library.
export function lyricExcerptAt(lines: LyricLine[], position: number): LyricExcerpt {
  const match = lineIndexAt(lines, position)
  const active = match >= 0 && position - lines[match].at <= 20_000
  return { previous: active ? lines[match - 1]?.text ?? '' : '', current: active ? lines[match].text : '',
    next: Number.isFinite(position) ? lines[match + 1]?.text ?? '' : '', at: active ? lines[match].at : null }
}
