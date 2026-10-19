import { useEffect, useRef, useState } from 'react'
import { drawFigurine, frameFor, loadFigurine, type VoicePhase } from './figurine'
import './companion.css'
export function Figurine({
  phase = 'idle',
  greeting = 0,
  motion = true,
}: {
  phase?: VoicePhase
  greeting?: number
  motion?: boolean
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    [error, setError] = useState('')
  const greetingClock = useRef({ key: 0, at: 0 })
  if (greetingClock.current.key !== greeting)
    greetingClock.current = { key: greeting, at: performance.now() }
  useEffect(() => {
    let disposed = false,
      frame = 0,
      last = -Infinity
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    const active = motion && !reduced.matches
    const greetingAt = greetingClock.current.at
    void loadFigurine()
      .then((atlas) => {
        const element = canvas.current
        if (!element || disposed) return
        const ratio = Math.min(devicePixelRatio || 1, 2)
        element.width = 192 * ratio
        element.height = 256 * ratio
        const context = element.getContext('2d')!
        const draw = (time: number) => {
          if (disposed) return
          if (!document.hidden && time - last > 45) {
            last = time
            context.setTransform(ratio, 0, 0, ratio, 0, 0)
            drawFigurine(
              context,
              atlas,
              frameFor(phase, time, active, greetingAt),
              phase,
              time,
              active,
            )
          }
          if (active) frame = requestAnimationFrame(draw)
        }
        draw(performance.now())
      })
      .catch(() => {
        if (!disposed) setError('形象暂未加载')
      })
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
    }
  }, [phase, greeting, motion])
  return (
    <div className={'companion-stage phase-' + phase} role="img" aria-label={error || '小鱼'}>
      <div className="companion-halo" aria-hidden="true" />
      <canvas ref={canvas} />
      <div className="voice-orbit" aria-hidden="true">
        <i />
        <i />
      </div>
      {error && <small role="status">{error}</small>}
    </div>
  )
}
