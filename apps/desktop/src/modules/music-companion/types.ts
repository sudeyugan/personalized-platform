export interface MediaSnapshot {
  title: string; artist: string; album: string
  playing: boolean; positionMs: number; durationMs: number; cover?: string | null
  coverUnchanged?: boolean
  canPlay: boolean; canPause: boolean; canPrevious: boolean; canNext: boolean
}
export type MediaAction = 'play' | 'pause' | 'previous' | 'next'
export interface ListeningPreferences { enabled: boolean; controls: boolean; onlineLyrics: boolean; qqLyrics?: boolean; lyricOffsetMs: number }
export const trackKey = (song: MediaSnapshot | null) => song ? JSON.stringify([song.title, song.artist, song.album, Math.round(song.durationMs / 1000)]) : ''
export const coverKey = (song: MediaSnapshot | null) => song ? JSON.stringify([song.title, song.artist, song.album]) : ''
export const validAction = (value: unknown): value is MediaAction => typeof value === 'string' && ['play', 'pause', 'previous', 'next'].includes(value)
