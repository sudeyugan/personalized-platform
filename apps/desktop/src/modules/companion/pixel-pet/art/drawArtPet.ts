import type { PixelPetFrame } from '../types'
import type { PreparedArt } from './prepareArt'
import { drawOriginalEye } from './eyeRaster'
import { drawFloatingArt } from './drawFloatingArt'
import { drawConnectedArt } from './deformation'

export function drawArtPet(ctx: CanvasRenderingContext2D, art: PreparedArt, frame: PixelPetFrame) {
  // Change eyes in the mother texture before its connected drawing bends.
  // Neck, sleeves, ribbons and hair never move as cut-out islands.
  const originalEyes = frame.eyeOpen === 1 && !frame.gaze.x && !frame.gaze.y
  if (!originalEyes) {
    art.ctx.clearRect(0, 0, art.working.width, art.working.height)
    art.ctx.drawImage(art.source, 0, 0)
    art.eyes.forEach((eye) => drawOriginalEye(art.ctx, eye, frame))
  }
  ctx.imageSmoothingEnabled = !art.profile.pixelated
  ctx.clearRect(0, 0, 192, 240)
  const source = originalEyes ? art.source : art.working
  if (art.profile.floating) drawFloatingArt(ctx, source, frame)
  else drawConnectedArt(ctx, source, art.rows, frame, art.resolution)
}
