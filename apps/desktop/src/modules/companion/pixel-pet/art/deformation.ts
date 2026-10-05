import type { PixelPetFrame } from '../types'
import { artPlacement, type ArtProfile } from './artProfiles'

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const smooth = (a: number, b: number, value: number) => {
  const t = clamp((value - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
export interface ArtRow { head: number; hair: number; vertical: number; horizontal?: number }
export function prepareArtRows(profile: ArtProfile, resolution: number): ArtRow[] {
  const fit = artPlacement(profile)
  const eyeY = fit.y + profile.eyes.reduce((n, eye) => n + eye.y, 0) / profile.eyes.length * fit.scale
  const bands = profile.hands.map((hand) => {
    const ys = hand.map((point) => fit.y + point[1] * profile.height * fit.scale)
    return { min: Math.min(...ys) - 2, max: Math.max(...ys) + 2 }
  })
  return Array.from({ length: 240 * resolution + 1 }, (_, index) => {
    const y = index / resolution
    const head = 1 - smooth(eyeY + 16, eyeY + 65, y)
    const hair = smooth(eyeY + 12, eyeY + 80, y)
    // Smoothly settle onto the fixed grip bands, rather than cutting out hands.
    let vertical = smooth(0, 12, y) * (1 - smooth(222, 240, y))
    for (const band of bands) {
      const anchor = smooth(band.min - 12, band.min, y) * (1 - smooth(band.max, band.max + 12, y))
      vertical *= 1 - anchor
    }
    return { head, hair, vertical, horizontal: profile.edgeY ? vertical : 1 }
  })
}
export function rowDisplacement(row: ArtRow, frame: PixelPetFrame) {
  return {
    x: (clamp(frame.head.x, -1, 1) * .35 * row.head + clamp(frame.hair.x, -1, 1) * .45 * row.hair) * (row.horizontal ?? 1),
    y: (clamp(frame.head.y, -1.5, 1.5) * .35 * row.head + clamp(frame.breath, -1, 1) * .3 * (1 - row.head)) * row.vertical,
  }
}
// Every destination scanline is filled. Neighbouring rows share a continuous,
// bounded source mapping, so neck/hair/sleeves never expose polygon cut seams.
export function drawConnectedArt(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, rows: ArtRow[], frame: PixelPetFrame, resolution: number, floating = false) {
  if (!frame.head.x && !frame.head.y && !frame.hair.x && !frame.breath) {
    ctx.drawImage(source, 0, 0, 192, 240)
    return
  }
  for (let index = 0; index < source.height; index++) {
    const shift = rowDisplacement(rows[index], frame)
    const next = rowDisplacement(rows[index + 1], frame)
    const sy = clamp(index - shift.y * resolution, 0, source.height - 1)
    const sh = Math.max(.1, 1 - (next.y - shift.y) * resolution)
    // The right boundary is always x=192. No independent integer rounding of parts.
    ctx.drawImage(source, 0, sy, source.width, Math.min(sh, source.height - sy),
      shift.x, index / resolution, floating ? 192 : 192 - shift.x, 1 / resolution)
  }
}
