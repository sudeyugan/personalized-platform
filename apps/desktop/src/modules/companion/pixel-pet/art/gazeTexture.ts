import { gazeDisplacement } from './gazeSampling'

export interface IrisGaze {
  width: number; height: number; original: Uint8ClampedArray
  iris: Uint8Array; aperture: Uint8Array; background: Uint8ClampedArray
  output: Uint8ClampedArray; rx: number; ry: number
}
export function prepareIrisGaze(original: Uint8ClampedArray, width: number, height: number, aperture: Uint8Array,
  rx: number, ry: number, irisX: number, irisY: number, irisRx: number, irisRy: number): IrisGaze {
  const iris = new Uint8Array(width * height), whites: number[] = [], fallback: number[] = []
  for (let i = 0; i < iris.length; i++) {
    const p = i * 4, r = original[p], g = original[p + 1], b = original[p + 2]
    const distance = ((i % width - irisX) / irisRx) ** 2 + ((Math.floor(i / width) - irisY) / irisRy) ** 2
    const blue = b > r * 1.08 && b >= g * .94
    const white = r > 175 && g > 175 && b >= r * .985 && Math.abs(r - g) < 22
    const pupil = r < 120 && g < 130 && b < 185
    iris[i] = Number(aperture[i] && distance < 1.18 && (blue || ((white || pupil) && distance < .85)))
    if (aperture[i] && white) { fallback.push(i); if (!iris[i]) whites.push(i) }
  }
  const background = original.slice(), candidates = whites.length ? whites : fallback
  // A future asset without any sclera samples keeps its original eye safely.
  if (!candidates.length) iris.fill(0)
  // Restore only exposed iris pixels using the artist's neighbouring sclera,
  // never a generic eye outline or flat replacement face colour.
  for (let i = 0; i < iris.length; i++) if (iris[i] && candidates.length) {
    const colour = [0, 0, 0, 0]; let sum = 0
    for (const candidate of candidates) {
      const distance = (candidate % width - i % width) ** 2 + (Math.floor(candidate / width) - Math.floor(i / width)) ** 2
      const weight = 1 / (distance + 4); sum += weight
      for (let c = 0; c < 4; c++) colour[c] += original[candidate * 4 + c] * weight
    }
    for (let c = 0; c < 4; c++) background[i * 4 + c] = colour[c] / sum
  }
  // Preserve the iris's natural off-centre origin; no recentering of the artwork.
  return { width, height, original, iris, aperture, background, output: original.slice(), rx, ry }
}
export function renderIrisGaze(eye: IrisGaze, x: number, y: number) {
  const { width, height, original, background, output, iris, aperture } = eye
  if (!x && !y) { output.set(original); return output }
  const { x: dx, y: dy } = gazeDisplacement(eye.rx, eye.ry, x, y)
  output.set(original)
  for (let i = 0; i < iris.length; i++) if (aperture[i]) {
    const p = i * 4, sx = i % width - dx, sy = Math.floor(i / width) - dy
    const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0
    let red = 0, green = 0, blue = 0, alpha = 0
    for (let oy = 0; oy <= 1; oy++) for (let ox = 0; ox <= 1; ox++) {
      const px = x0 + ox, py = y0 + oy
      if (px < 0 || py < 0 || px >= width || py >= height) continue
      const sample = py * width + px
      if (!iris[sample]) continue
      const weight = (ox ? fx : 1 - fx) * (oy ? fy : 1 - fy)
      alpha += weight
      red += original[sample * 4] * weight
      green += original[sample * 4 + 1] * weight
      blue += original[sample * 4 + 2] * weight
    }
    output[p] = background[p] * (1 - alpha) + red
    output[p + 1] = background[p + 1] * (1 - alpha) + green
    output[p + 2] = background[p + 2] * (1 - alpha) + blue
  }
  return output
}
