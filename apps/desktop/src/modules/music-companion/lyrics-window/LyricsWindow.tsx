import { Channel, invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Maximize2, Minimize2, Pin, PinOff, Pause, Play, SkipForward, X, MousePointer2 } from 'lucide-react'
import { useEffect, useState, type CSSProperties } from 'react'
import { lyricExcerptAt } from '../lyrics'
import { LyricsReader } from './LyricsReader'
import type { LyricsPacket, LyricsRequest, LyricsRequestBody, LyricsTick, LyricsTrack } from './types'
import './lyricsWindow.css'

export function LyricsPresentation({ track, tick, request }: { track: LyricsTrack; tick: LyricsTick; request: (request: LyricsRequest) => void }) {
  const send = (value: LyricsRequestBody) => request({ ...value, key: tick.key } as LyricsRequest)
  const excerpt = lyricExcerptAt(track.lines, tick.position)
  const drag = (event: React.PointerEvent) => {
    if (tick.pinned && event.button === 0 && !((event.target as HTMLElement).closest('button')) && '__TAURI_INTERNALS__' in window) void getCurrentWindow().startDragging().catch(() => undefined)
  }
  return <main className={'desktop-lyrics ' + (tick.pixel ? 'pet' : 'webm') + (tick.reader ? ' reader' : ' subtitle') + (tick.pinned ? ' pinned' : '') + (tick.busy ? ' busy' : '')} style={{ '--lyrics-font': tick.fontSize + 'px', '--lyrics-opacity': tick.opacity / 100 } as CSSProperties}>
    <section className="lyrics-paper">
      <header className="lyrics-window-header" onPointerDown={drag}><div title={track.title + ' · ' + track.artist}><small>一隅伴听</small><strong>{track.title}</strong>{tick.reader && <span>{track.artist}</span>}</div><nav>
        <button aria-label={tick.reader ? '收起歌词阅读' : '展开歌词阅读'} onClick={() => send({ kind: 'view', reader: !tick.reader })}>{tick.reader ? <Minimize2 size={13} /> : <Maximize2 size={13} />}</button>
        <button aria-label={tick.pinned ? '跟随角色' : '独立摆放歌词'} onClick={() => send({ kind: 'pin', pinned: !tick.pinned })}>{tick.pinned ? <PinOff size={13} /> : <Pin size={13} />}</button>
        <button aria-label="隐藏歌词窗口" onClick={() => send({ kind: 'close' })}><X size={13} /></button>
      </nav></header>
      {tick.reader ? <LyricsReader key={track.key} lines={track.lines} position={tick.position} fontSize={tick.fontSize} /> : <button className="lyrics-subtitle-line" aria-label="阅读整曲歌词" onClick={() => send({ kind: 'view', reader: true })}><span>{excerpt.current}</span></button>}
      {tick.reader && <footer className="lyrics-reader-footer">
        <div className="lyrics-reader-tools"><div><button aria-label="减小歌词字号" onClick={() => send({ kind: 'font', delta: -1 })}>A−</button><button aria-label="增大歌词字号" onClick={() => send({ kind: 'font', delta: 1 })}>A＋</button><button aria-label="降低歌词不透明度" onClick={() => send({ kind: 'opacity', delta: -5 })}>淡</button><button aria-label="提高歌词不透明度" onClick={() => send({ kind: 'opacity', delta: 5 })}>浓</button></div><div>{tick.controls && <><button disabled={!(tick.playing ? tick.canPause : tick.canPlay)} aria-label={tick.playing ? '暂停QQ音乐' : '播放QQ音乐'} onClick={() => send({ kind: 'control', action: tick.playing ? 'pause' : 'play' })}>{tick.playing ? <Pause size={13} /> : <Play size={13} />}</button><button disabled={!tick.canNext} aria-label="QQ音乐下一首" onClick={() => send({ kind: 'control', action: 'next' })}><SkipForward size={13} /></button></>}{tick.pinned && <button aria-label="开启歌词鼠标穿透" title="开启后请在伴听设置中关闭鼠标穿透" onClick={() => send({ kind: 'through', enabled: true })}><MousePointer2 size={13} /></button>}</div></div>
        <div className="lyrics-calibration"><span>本曲校准 · {(tick.offsetMs / 1000).toFixed(1)}s</span><button aria-label="歌词提前0.1秒" onClick={() => send({ kind: 'offset', deltaMs: 100 })}>提前</button><button aria-label="歌词延后0.1秒" onClick={() => send({ kind: 'offset', deltaMs: -100 })}>延后</button><button aria-label="重置本曲歌词校准" onClick={() => send({ kind: 'offset', deltaMs: 0 })}>归零</button></div>
      </footer>}
    </section>
  </main>
}

export function LyricsWindow() {
  const [track, setTrack] = useState<LyricsTrack>()
  const [tick, setTick] = useState<LyricsTick>()
  const [error, setError] = useState('')
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return
    let disposed = false, subscriptionId: number | undefined
    const channel = new Channel<LyricsPacket>()
    channel.onmessage = (packet) => {
      if (disposed) return
      if (packet.kind === 'track') { setTrack(packet.track); setTick((current) => current?.key === packet.track.key ? current : undefined) }
      else if (packet.kind === 'tick') setTick(packet.tick)
      else { setTrack(undefined); setTick(undefined) }
    }
    const unsubscribe = (id: number) => { void invoke('companion_lyrics_unsubscribe', { subscriptionId: id }).catch(() => undefined) }
    void invoke<number>('companion_lyrics_subscribe', { onChange: channel }).then((id) => { if (disposed) unsubscribe(id); else subscriptionId = id }).catch(() => { if (!disposed) setError('歌词连接暂不可用') })
    return () => { disposed = true; channel.onmessage = () => undefined; if (subscriptionId !== undefined) unsubscribe(subscriptionId) }
  }, [])
  if (!track || !tick || track.key !== tick.key) return <main className="desktop-lyrics empty">{error && <small>{error}</small>}</main>
  return <LyricsPresentation track={track} tick={tick} request={(request) => { void invoke('companion_lyrics_request', { request }).catch(() => setError('操作未完成，请重试')) }} />
}
