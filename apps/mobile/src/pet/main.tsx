import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { CompanionPetStyle } from '../../../desktop/src/domain/models'
import type { PixelPetPose } from '../../../desktop/src/modules/companion/pixel-pet/types'
import { createPixelPetAnimator } from '../../../desktop/src/modules/companion/pixel-pet/animation'
import {
  loadPreparedArt,
  type PreparedArt,
} from '../../../desktop/src/modules/companion/pixel-pet/art/prepareArt'
import { drawArtPet } from '../../../desktop/src/modules/companion/pixel-pet/art/drawArtPet'
interface PetState {
  style: CompanionPetStyle
  pose: PixelPetPose
  motion: boolean
  resting: boolean
  visible: boolean
}
const initial: PetState = { style: 'pixel', pose: 'right-edge', motion: true, resting: false, visible: true }
declare global {
  interface Window {
    yiyuPetState?: (state: unknown) => void
  }
}
function validate(value: unknown): PetState | undefined {
  if (!value || typeof value !== 'object') return
  const next = value as PetState
  if (
    !['pixel', 'chibi', 'detailed'].includes(next.style) ||
    !['right-edge', 'left-edge', 'bottom-edge', 'float'].includes(next.pose) ||
    ['motion', 'resting', 'visible'].some((key) => typeof next[key as keyof PetState] !== 'boolean')
  )
    return
  return next
}
export function PetStage() {
  const canvas = useRef<HTMLCanvasElement>(null),
    [state, setState] = useState(initial)
  const [prepared, setPrepared] = useState<{
      art: PreparedArt
      style: CompanionPetStyle
      pose: PixelPetPose
    }>(),
    [failed, setFailed] = useState(false)
  useEffect(() => {
    window.yiyuPetState = (value) => {
      const next = validate(value)
      if (next) setState(next)
    }
    return () => {
      delete window.yiyuPetState
    }
  }, [])
  useEffect(() => {
    let alive = true
    setFailed(false)
    void loadPreparedArt(state.style, state.pose)
      .then((value) => {
        if (alive) setPrepared({ art: value, style: state.style, pose: state.pose })
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [state.style, state.pose])
  useEffect(() => {
    const node = canvas.current,
      ctx = node?.getContext('2d')
    if (!node || !ctx || !prepared || prepared.style !== state.style || prepared.pose !== state.pose) return
    const art = prepared.art
    const animator = createPixelPetAnimator(),
      ratio = Math.min(2, devicePixelRatio || 1)
    node.width = Math.round(192 * ratio)
    node.height = Math.round(240 * ratio)
    let request = 0,
      previous = 0
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || !state.motion || state.resting
    const render = (now: number) => {
      if (!state.visible || document.hidden) {
        request = 0
        return
      }
      if (now - previous >= 1000 / 24 || !previous) {
        previous = now
        const frame = animator.update(now, null, reduce)
        // Look gently into the usable phone screen, never track other-app touches.
        frame.gaze = {
          x: state.pose.endsWith('edge') && state.pose !== 'bottom-edge' ? -0.65 : 0,
          y: state.pose === 'bottom-edge' ? -0.85 : -0.15,
        }
        if (state.resting) {
          frame.eyeOpen = 0.12
          frame.blinkPhase = 'closed'
        }
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
        if (state.pose === 'left-edge') {
          ctx.translate(192, 0)
          ctx.scale(-1, 1)
        }
        drawArtPet(ctx, art, frame)
        node.dataset.pose = state.pose
        node.dataset.style = state.style
      }
      if (!reduce) request = requestAnimationFrame(render)
    }
    const resume = () => {
      if (request) cancelAnimationFrame(request)
      request = requestAnimationFrame(render)
    }
    resume()
    document.addEventListener('visibilitychange', resume)
    return () => {
      cancelAnimationFrame(request)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [prepared, state.pose, state.style, state.visible, state.resting, state.motion])
  return (
    <>
      <canvas
        ref={canvas}
        aria-label={`小鱼 · ${state.pose}`}
        style={{ imageRendering: state.style === 'pixel' || state.style === 'chibi' ? 'pixelated' : 'auto' }}
      />
      {failed && (
        <span style={{ position: 'absolute', bottom: 8, fontSize: 11, color: '#887c6c' }}>
          画面暂未准备好
        </span>
      )}
    </>
  )
}
createRoot(document.getElementById('root')!).render(<PetStage />)
