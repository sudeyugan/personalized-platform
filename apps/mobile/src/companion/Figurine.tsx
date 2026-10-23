import { useEffect, useRef, useState } from 'react'
import { drawFigurine, frameFor, loadFigurine, type VoicePhase } from './figurine'
import './companion.css'
import { petTransform, type PetAction } from './figurineMotion'
export function Figurine({
  phase = 'idle',
  greeting = 0,
  motion = true,
  seated = false,
  resting = false,
  action = 'idle',
  actionKey = 0,
  edge = '',
}: {
  phase?: VoicePhase
  greeting?: number
  motion?: boolean
  seated?: boolean
  resting?: boolean
  action?: PetAction
  actionKey?: number
  edge?: string
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    [error, setError] = useState('')
  const [reducedMotion, setReducedMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(preference.matches)
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])
  const greetingClock = useRef({ key: 0, at: 0 })
  const actionClock = useRef({ key: 0, at: 0 })
  if (greetingClock.current.key !== greeting)
    greetingClock.current = { key: greeting, at: performance.now() }
  if (actionClock.current.key !== actionKey)
    actionClock.current = { key: actionKey, at: performance.now() }
  useEffect(() => {
    let disposed = false,
      frame = 0,
      last = -Infinity
    let observer: ResizeObserver | undefined
    const active = motion && !resting && !reducedMotion
    const greetingAt = greetingClock.current.at
    void loadFigurine()
      .then((atlas) => {
        const element = canvas.current
        if (!element || disposed) return
        let ratio = 1
        const context = element.getContext('2d')!
        const resize = () => {
          ratio = Math.max(.25, Math.min(3, (element.clientWidth || 192) / 192 * Math.min(devicePixelRatio || 1, 3)))
          element.width = Math.round(192 * ratio)
          element.height = Math.round(256 * ratio)
          last = -Infinity
          if (!active) draw(performance.now())
        }
        const draw = (time: number) => {
          if (disposed) return
          if (!document.hidden && time - last > 45) {
            last = time
            context.setTransform(ratio, 0, 0, ratio, 0, 0)
            const poseFrame = frameFor(phase, time, active, greetingAt, seated, resting)
            drawFigurine(
              context,
              atlas,
              poseFrame,
              phase,
              time,
              active,
              petTransform(time, action, actionClock.current.at, active && !resting, seated, edge),
              seated,
            )
            element.dataset.frame = String(poseFrame)
          }
          if (active) frame = requestAnimationFrame(draw)
        }
        observer = new ResizeObserver(resize)
        observer.observe(element)
        resize()
        draw(performance.now())
      })
      .catch(() => {
        if (!disposed) setError('形象暂未加载')
      })
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      observer?.disconnect()
    }
  }, [phase, greeting, motion, seated, resting, action, actionKey, edge, reducedMotion])
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
