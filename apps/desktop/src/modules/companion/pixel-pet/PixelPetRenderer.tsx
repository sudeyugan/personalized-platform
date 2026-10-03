import { useEffect, useRef, type RefObject } from 'react'
import { createPixelPetAnimator } from './animation'
import { drawPixelPet } from './drawPixelPet'
import { PIXEL_PET_SIZE, type PixelPoint, type PixelPetPose } from './types'
import './pixelPet.css'

interface Props {
  pointer?: RefObject<PixelPoint | null>
  pose?: PixelPetPose
  scale?: number
  pixelRatio?: number
  active?: boolean
}
export function PixelPetRenderer({ pointer, pose = 'right-edge', scale = 1, pixelRatio = 1, active = true }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const element = canvas.current
    const ctx = element?.getContext('2d')
    if (!element || !ctx) return
    const animator = createPixelPetAnimator()
    let browserPointer: PixelPoint | null = null
    let frameId = 0
    let disposed = false
    let lastDraw = -Infinity
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const mouse = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect()
      browserPointer = {
        x: (event.clientX - rect.left) / rect.width * PIXEL_PET_SIZE.width,
        y: (event.clientY - rect.top) / rect.height * PIXEL_PET_SIZE.height,
      }
    }
    const tick = (now: number) => {
      if (disposed || document.hidden) return
      if (now - lastDraw >= 1000 / 30) {
        lastDraw = now
        const next = animator.update(now, pointer ? pointer.current : browserPointer, reducedMotion?.matches)
        drawPixelPet(ctx, next, pose)
      }
      frameId = window.requestAnimationFrame(tick)
    }
    const visibility = () => {
      window.cancelAnimationFrame(frameId)
      if (active && !document.hidden) frameId = window.requestAnimationFrame(tick)
    }
    drawPixelPet(ctx, animator.update(performance.now(), null, reducedMotion?.matches), pose)
    if (!pointer) document.addEventListener('pointermove', mouse)
    if (active) frameId = window.requestAnimationFrame(tick)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      disposed = true
      window.cancelAnimationFrame(frameId)
      document.removeEventListener('pointermove', mouse)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [active, pointer, pose])
  return <canvas ref={canvas} className="pixel-pet-canvas" width={PIXEL_PET_SIZE.width} height={PIXEL_PET_SIZE.height}
    style={{ width: PIXEL_PET_SIZE.width * scale / pixelRatio, height: PIXEL_PET_SIZE.height * scale / pixelRatio }}
    role="img" aria-label="银蓝长发的像素小鱼，双手扒在右侧边缘" data-pixel-pet-pose={pose} />
}
