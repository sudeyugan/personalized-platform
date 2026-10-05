import { describe, expect, it, vi } from 'vitest'
import { drawFloatingArt } from './drawFloatingArt'
import type { PixelPetFrame } from '../types'

const neutral: PixelPetFrame = { gaze: { x: 0, y: 0 }, eyeOpen: 1, blinkPhase: 'open', head: { x: 0, y: 0 }, hair: { x: 0, y: 0 }, breath: 0 }
describe('stable floating mother texture', () => {
  it('uses one exact full-texture draw at rest, not 720 changing scanlines', () => {
    const drawImage = vi.fn(), source = {} as HTMLCanvasElement
    drawFloatingArt({ drawImage } as unknown as CanvasRenderingContext2D, source, neutral)
    expect(drawImage).toHaveBeenCalledExactlyOnceWith(source, 0, 0, 192, 240)
  })
  it('keeps deliberate tilt/drag connected, uses subpixel smoothing and restores context', () => {
    const ctx = { save: vi.fn(), restore: vi.fn(), drawImage: vi.fn(), translate: vi.fn(), rotate: vi.fn(), imageSmoothingEnabled: false }
    drawFloatingArt(ctx as unknown as CanvasRenderingContext2D, {} as HTMLCanvasElement, { ...neutral, head: { x: -.2, y: .1 }, tilt: .006 })
    expect(ctx.drawImage).toHaveBeenCalledTimes(1)
    expect(ctx.translate).toHaveBeenCalledWith(95.8, 160.1)
    expect(ctx.rotate).toHaveBeenCalledWith(.006)
    expect(ctx.imageSmoothingEnabled).toBe(true)
    expect(ctx.save).toHaveBeenCalledOnce(); expect(ctx.restore).toHaveBeenCalledOnce()
  })
})
