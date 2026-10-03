export type PixelVertex = readonly [number, number]
export function block(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, width: number, height: number) {
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height))
}
// Rasterize polygons to whole-pixel scanlines; Canvas path anti-aliasing is not used.
export function polygon(ctx: CanvasRenderingContext2D, color: string, points: readonly PixelVertex[]) {
  const vertices = points.map(([x, y]) => [Math.round(x), Math.round(y)] as const)
  const min = Math.min(...vertices.map((point) => point[1]))
  const max = Math.max(...vertices.map((point) => point[1]))
  ctx.fillStyle = color
  for (let y = min; y < max; y++) {
    const intersections: number[] = []
    for (let i = 0; i < vertices.length; i++) {
      const [x1, y1] = vertices[i]
      const [x2, y2] = vertices[(i + 1) % vertices.length]
      if ((y1 <= y + 0.5 && y2 > y + 0.5) || (y2 <= y + 0.5 && y1 > y + 0.5)) {
        intersections.push(x1 + (y + 0.5 - y1) / (y2 - y1) * (x2 - x1))
      }
    }
    intersections.sort((a, b) => a - b)
    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const left = Math.ceil(intersections[i] - 0.5)
      const right = Math.ceil(intersections[i + 1] - 0.5)
      ctx.fillRect(left, y, right - left, 1)
    }
  }
}
export const palette = {
  outline: '#7f849b', hairShadow: '#a9b6cf', hairDeep: '#8c9fbe', hairMid: '#ccd5e5',
  hair: '#e5e8f1', hairLight: '#faf7fb', hairGlint: '#ffffff',
  skinOutline: '#c3a0a9', skinShadow: '#ebc0bf', skin: '#f8dcd0',
  skinLight: '#ffede0', blush: '#efc2c9', lash: '#594855',
  ink: '#30313f', inkLight: '#535467', white: '#f7f5fa',
  clothShadow: '#c7d1e3', clothMid: '#e3e6f1', blue: '#8db8e7', blueDeep: '#5d79b0',
  eye: '#83bbe8', eyeLight: '#c1e5fa', pupil: '#426591',
} as const
