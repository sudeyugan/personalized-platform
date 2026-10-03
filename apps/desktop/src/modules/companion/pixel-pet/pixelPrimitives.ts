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
  outline: '#444653', hairShadow: '#8499b9', hairDeep: '#607b9f', hairMid: '#bbcee2',
  hair: '#dde6f1', hairLight: '#f6f5fa', skinShadow: '#d9a5ab', skin: '#f5d8d0',
  skinLight: '#ffe9dd', blush: '#e9b3c1', ink: '#242a38', inkLight: '#495166',
  white: '#f2f3f8', clothShadow: '#c3d3e5', blue: '#649ccc', blueDeep: '#3f5f99',
  eye: '#74b7e1', eyeLight: '#b5e5f5', pupil: '#284d7d',
} as const
