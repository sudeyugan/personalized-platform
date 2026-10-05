import type { PixelPetFrame } from '../types'
import { artPlacement, type ArtEye, type ArtProfile } from './artProfiles'
import { prepareIrisGaze, renderIrisGaze, type IrisGaze } from './gazeTexture'

export interface PreparedEye {
  x: number; y: number; width: number; height: number; resolution: number
  cx: number; cy: number; rx: number; ry: number; cosine: number; sine: number
  original: Uint8ClampedArray; skin: Uint8ClampedArray; gaze: IrisGaze
  aperture: Uint8Array; affected: Uint8Array; lid: Uint8ClampedArray
  canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; pixels: ImageData
}
const skinColor = (r: number, g: number, b: number) => r > 205 && g > 145 && b > 125 && r - g < 65 && g - b < 55 && r > g * 1.025 && g > b * 1.015
export function prepareEye(source: ImageData, eye: ArtEye, profile: ArtProfile, resolution: number): PreparedEye {
  const fit = artPlacement(profile), cosine = Math.cos(eye.angle), sine = Math.sin(eye.angle)
  const cx = (fit.x + eye.x * fit.scale) * resolution, cy = (fit.y + eye.y * fit.scale) * resolution
  const rx = eye.rx * fit.scale * resolution, ry = eye.ry * fit.scale * resolution
  const radius = Math.ceil(Math.hypot(rx, ry) + 4 * resolution)
  const x = Math.max(0, Math.floor(cx - radius)), y = Math.max(0, Math.floor(cy - radius))
  const width = Math.min(source.width - x, radius * 2 + 2), height = Math.min(source.height - y, radius * 2 + 2)
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前环境不支持 Canvas 2D')
  const pixels = ctx.createImageData(width, height), original = new Uint8ClampedArray(pixels.data.length)
  const aperture = new Uint8Array(width * height), affected = new Uint8Array(width * height)
  const skins: number[] = [], lid = new Uint8ClampedArray(Math.ceil(rx * 2 + 1) * 4)
  for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
    const i = py * width + px, p = i * 4, src = ((y + py) * source.width + x + px) * 4
    original.set(source.data.subarray(src, src + 4), p)
    const dx = x + px - cx, dy = y + py - cy, u = dx * cosine + dy * sine, v = -dx * sine + dy * cosine
    const distance = (u / rx) ** 2 + (v / ry) ** 2
    const irisDx = x + px - (fit.x + eye.irisX * fit.scale) * resolution
    const irisDy = y + py - (fit.y + eye.irisY * fit.scale) * resolution
    const irisDistance = (irisDx / (eye.irisRx * fit.scale * resolution)) ** 2 + (irisDy / (eye.irisRy * fit.scale * resolution)) ** 2
    const [r, g, b, a] = original.subarray(p, p + 4)
    const blue = b > r * 1.08 && b >= g * .94
    const white = r > 175 && g > 175 && b >= r * .985 && Math.abs(r - g) < 22
    const dark = r < 185 && g < 150 && b < 185
    aperture[i] = Number(a > 100 && (distance < 1.3 || irisDistance < 1.2) && (blue || white || (dark && irisDistance < .7)))
    affected[i] = Number(a > 100 && (distance < 1.45 || irisDistance < 1.2 || (dark && distance < 2.1 && v < 0)))
    if (a > 200 && skinColor(r, g, b) && px % resolution === 0 && py % resolution === 0) skins.push(i)
  }
  const skin = original.slice()
  // Neighbouring face colours reconstruct the eyelid; never replace it with a flat peach ellipse.
  for (let i = 0; i < affected.length; i++) if (affected[i]) {
    let weightSum = 0
    const colour = [0, 0, 0, 0]
    for (const candidate of skins) {
      const d = (candidate % width - i % width) ** 2 + (Math.floor(candidate / width) - Math.floor(i / width)) ** 2
      const weight = 1 / (d + resolution * resolution)
      weightSum += weight
      for (let channel = 0; channel < 4; channel++) colour[channel] += original[candidate * 4 + channel] * weight
    }
    if (weightSum) for (let channel = 0; channel < 4; channel++) skin[i * 4 + channel] = colour[channel] / weightSum
  }
  // At tilted/partially clipped columns the sampling ray may contain no pixel.
  // Fall back to an actual nearby dark lash (or face), never patch pixel 0 (hair).
  let fallback = skins[0] ?? 0, fallbackLight = Infinity
  for (let i = 0; i < affected.length; i++) if (affected[i]) {
    const p = i * 4, r = original[p], g = original[p + 1], b = original[p + 2]
    const nonBlue = b <= r * 1.08 || b < g * .94
    const light = r + g + b
    if (original[p + 3] > 100 && nonBlue && r < 185 && g < 150 && b < 185 && light < fallbackLight) { fallback = i; fallbackLight = light }
  }
  for (let column = 0; column < lid.length / 4; column++) {
    const u = column - rx
    let darkest = Infinity, selected = fallback * 4
    for (let v = -ry * 1.65; v <= -ry * .3; v += .5) {
      const px = Math.round(cx - x + u * cosine - v * sine), py = Math.round(cy - y + u * sine + v * cosine)
      if (px < 0 || py < 0 || px >= width || py >= height) continue
      const p = (py * width + px) * 4, light = original[p] + original[p + 1] + original[p + 2]
      const nonBlue = original[p + 2] <= original[p] * 1.08 || original[p + 2] < original[p + 1] * .94
      if (original[p + 3] > 100 && nonBlue && light < darkest) { darkest = light; selected = p }
    }
    lid.set(original.subarray(selected, selected + 4), column * 4)
  }
  const gaze = prepareIrisGaze(original, width, height, aperture, rx, ry,
    (fit.x + eye.irisX * fit.scale) * resolution - x, (fit.y + eye.irisY * fit.scale) * resolution - y,
    eye.irisRx * fit.scale * resolution, eye.irisRy * fit.scale * resolution)
  return { gaze, x, y, width, height, resolution, cx: cx - x, cy: cy - y, rx, ry, cosine, sine, original, skin, aperture, affected, lid, canvas, ctx, pixels }
}
export function renderEyePixels(eye: PreparedEye, frame: PixelPetFrame) {
  const { width, height, pixels, rx, cosine, sine } = eye
  const original = renderIrisGaze(eye.gaze, frame.gaze.x, frame.gaze.y)
  pixels.data.set(original)
  const open = Math.max(0, Math.min(1, frame.eyeOpen))
  // A neutral fully open eye is byte-for-byte the artist's eye, including lashes and highlights.
  if (open === 1) return pixels
  for (let i = 0; i < eye.affected.length; i++) if (eye.affected[i]) {
    const p = i * 4, px = i % width, py = Math.floor(i / width)
    const dx = px - eye.cx, dy = py - eye.cy, u = dx * cosine + dy * sine, v = -dx * sine + dy * cosine
    if (open < 1) pixels.data.set(eye.skin.subarray(p, p + 4), p)
    if (open < .03) {
      if (Math.abs(v) < .32 * eye.resolution && Math.abs(u) < rx * .94) {
        const column = Math.min(eye.lid.length / 4 - 1, Math.max(0, Math.round(u + rx))) * 4
        pixels.data.set(eye.lid.subarray(column, column + 4), p)
      }
      continue
    }
    const localV = v / open
    const sx = eye.cx + u * cosine - localV * sine
    const sy = eye.cy + u * sine + localV * cosine
    if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue
    const sample = Math.round(sy) * width + Math.round(sx)
    if (!eye.affected[sample]) continue
    const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1)
    const fx = sx - x0, fy = sy - y0
    for (let channel = 0; channel < 4; channel++) {
      const top = original[(y0 * width + x0) * 4 + channel] * (1 - fx) + original[(y0 * width + x1) * 4 + channel] * fx
      const bottom = original[(y1 * width + x0) * 4 + channel] * (1 - fx) + original[(y1 * width + x1) * 4 + channel] * fx
      pixels.data[p + channel] = top * (1 - fy) + bottom * fy
    }
  }
  return pixels
}
export function drawOriginalEye(ctx: CanvasRenderingContext2D, eye: PreparedEye, frame: PixelPetFrame) {
  if (frame.eyeOpen === 1 && !frame.gaze.x && !frame.gaze.y) return
  eye.ctx.putImageData(renderEyePixels(eye, frame), 0, 0)
  ctx.drawImage(eye.canvas, eye.x, eye.y)
}
