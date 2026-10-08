import type { LyricLine } from '../lyrics'
import type { MediaAction } from '../types'
export interface LyricsTrack { key: string; title: string; artist: string; lines: LyricLine[] }
export interface LyricsTick {
  key: string; position: number; playing: boolean; offsetMs: number; status: string
  reader: boolean; pinned: boolean; through: boolean; fontSize: number; opacity: number
  pixel: boolean; busy: boolean; controls: boolean; canPlay: boolean; canPause: boolean; canPrevious: boolean; canNext: boolean
}
export type LyricsPacket = { kind: 'track'; track: LyricsTrack } | { kind: 'tick'; tick: LyricsTick } | { kind: 'clear' }
export type LyricsRequest =
  | { kind: 'view'; key: string; reader: boolean } | { kind: 'pin'; key: string; pinned: boolean }
  | { kind: 'through'; key: string; enabled: boolean } | { kind: 'close'; key: string }
  | { kind: 'offset'; key: string; deltaMs: number } | { kind: 'font'; key: string; delta: number } | { kind: 'opacity'; key: string; delta: number }
  | { kind: 'control'; key: string; action: MediaAction }
export type LyricsRequestBody = { [K in LyricsRequest['kind']]: Omit<Extract<LyricsRequest, { kind: K }>, 'key'> }[LyricsRequest['kind']]
