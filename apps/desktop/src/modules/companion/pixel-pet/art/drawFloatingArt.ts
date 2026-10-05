import type { PixelPetFrame } from '../types'

// One connected texture and one transform: no independently resampled scanlines.
// Neutral output remains exactly the approved art, including its pixel edges.
export function drawFloatingArt(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, frame: PixelPetFrame) {
  const tilt = Math.max(-.01, Math.min(.01, frame.tilt ?? 0))
  if (!tilt && !frame.head.x && !frame.head.y) {
    ctx.drawImage(source, 0, 0, 192, 240)
    return
  }
  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.translate(96 + frame.head.x, 160 + frame.head.y)
  ctx.rotate(tilt)
  ctx.drawImage(source, -96, -160, 192, 240)
  ctx.restore()
}
