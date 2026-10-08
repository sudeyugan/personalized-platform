import { useEffect, useState } from 'react'
import { emitTo, listen } from '@tauri-apps/api/event'
import { Headphones } from 'lucide-react'
import type { PixelPetPose } from '../companion/pixel-pet/types'
import type { ListeningInput } from './listeningNotice'
import type { MediaSnapshot } from './types'
import type { LyricExcerpt } from './lyrics'
import './listening.css'

interface Display { enabled: boolean; controls: boolean; key: string; song: MediaSnapshot | null; lyric: string; excerpt?: LyricExcerpt }
export function ListeningBadge({ visible, pixel, side, busy, quiet, input }: { visible: boolean; pixel: boolean; side: PixelPetPose; busy: boolean; quiet: boolean; input?: ListeningInput }) {
  const [display, setDisplay] = useState<Display>()
  const [received, setReceived] = useState(0)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    let disposed = false, stop: (() => void) | undefined
    void listen<Display>('companion:listening', ({ payload }) => {
      if (!disposed) {
        setDisplay(previous => ({ ...payload, song: payload.song ? { ...payload.song, cover: payload.song.cover === undefined && payload.key === previous?.key ? previous.song?.cover : payload.song.cover } : null }))
        setReceived(Date.now()); setNow(Date.now())
      }
    }).then(value => { if (disposed) value(); else stop = value })
    return () => { disposed = true; stop?.() }
  }, [])
  useEffect(() => {
    if (!visible || !display?.enabled) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [visible, display?.enabled])
  useEffect(() => { if (input) input.playing.current = visible && pixel && !busy && !!display?.enabled && !!display.song?.playing && now - received <= 6000 }, [input, visible, pixel, busy, display, now, received])
  useEffect(() => () => { if (input) { input.playing.current = false; input.marker.current = null } }, [input])
  if (!visible || !display?.enabled || !display.song || now - received > 6000 || busy) return null
  const { song } = display
  return <aside className={'listening-badge ' + (pixel ? 'pixel' : 'webm') + ' side-' + side + (song.playing ? ' playing' : '') + (quiet ? ' quiet' : '')}>
    <button ref={element => { if (input) input.marker.current = element }} type="button" className="listening-marker" disabled={quiet} onClick={() => { void emitTo('main', 'companion:lyrics-open', { key: display.key }).catch(() => undefined) }} aria-label="展开伴听歌词"><Headphones size={12} /><span>{song.title}</span><i aria-hidden="true">{song.playing ? '♪' : 'Ⅱ'}</i></button>
  </aside>
}
