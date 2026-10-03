import type { PixelPetFrame } from './types'
import { block, palette as p, polygon } from './pixelPrimitives'

export function face(ctx: CanvasRenderingContext2D) {
  // A tapered oval, with warm edge pixels rather than a dark geometric mask.
  polygon(ctx, p.skinOutline, [[89,55],[103,41],[139,38],[158,48],[168,66],[166,94],[158,108],[146,119],[132,123],[119,118],[105,109],[95,96],[90,77]])
  polygon(ctx, p.skinShadow, [[93,55],[106,45],[139,42],[155,51],[164,67],[162,93],[155,106],[144,117],[132,120],[120,115],[107,106],[98,94],[94,76]])
  polygon(ctx, p.skin, [[96,57],[108,47],[138,44],[153,53],[160,67],[160,91],[153,104],[143,114],[132,117],[121,113],[109,103],[101,91],[98,76]])
  polygon(ctx, p.skinLight, [[107,59],[139,48],[151,57],[157,74],[155,95],[142,110],[133,114],[122,109],[109,97],[103,79]])
  block(ctx, p.blush, 101, 95, 6, 1)
  block(ctx, p.blush, 149, 94, 6, 1)
  block(ctx, p.skinShadow, 102, 96, 2, 1)
  block(ctx, p.skinShadow, 151, 95, 2, 1)
  block(ctx, p.skinShadow, 131, 94, 1, 3)
  block(ctx, p.skinLight, 132, 95, 2, 1)
  block(ctx, p.skinOutline, 129, 108, 5, 1)
  block(ctx, p.skinShadow, 134, 107, 2, 1)
  block(ctx, p.skinLight, 130, 110, 4, 1)
}

// Stair-step eye aperture: iris pixels never escape the almond-shaped whites.
const aperture = [[5,8],[3,12],[1,16],[0,18],[0,18],[1,17],[1,16],[2,15],[3,13],[4,11],[5,9],[7,5]] as const
function eye(ctx: CanvasRenderingContext2D, x: number, y: number, frame: PixelPetFrame) {
  polygon(ctx, p.skinOutline, [[x+1,y-5],[x+7,y-7],[x+14,y-6],[x+15,y-5],[x+7,y-6]])
  const height = Math.round(12 * frame.eyeOpen)
  if (height <= 1) {
    polygon(ctx, p.lash, [[x-2,y+3],[x+3,y+6],[x+11,y+6],[x+17,y+3],[x+16,y+5],[x+11,y+8],[x+3,y+8]])
    return
  }
  const top = Math.round((12 - height) / 2)
  ctx.save()
  ctx.beginPath()
  for (let row = top; row < top + height; row++) {
    const [left, width] = aperture[row]
    ctx.rect(x + left, y + row, width, 1)
  }
  ctx.clip()
  block(ctx, p.white, x, y, 18, 12)
  iris(ctx, x + 5 + frame.gaze.x, y + frame.gaze.y)
  ctx.restore()
  if (height < 10) {
    block(ctx, p.lash, x + 2, y + top, 14, 1)
  } else {
    // Broken, tapered lash line; no rectangular black top border.
    block(ctx, p.lash, x - 2, y + 1, 4, 1)
    block(ctx, p.lash, x, y + 2, 4, 2)
    block(ctx, p.lash, x + 3, y, 5, 2)
    block(ctx, p.lash, x + 8, y, 5, 1)
    block(ctx, p.lash, x + 13, y + 1, 3, 1)
    block(ctx, p.skinOutline, x + 16, y + 2, 2, 2)
  }
  block(ctx, p.skinShadow, x + 5, y + top + height, 8, 1)
}
export function iris(ctx: CanvasRenderingContext2D, x: number, y: number) {
  polygon(ctx, p.blueDeep, [[x+2,y],[x+6,y],[x+8,y+2],[x+8,y+8],[x+6,y+11],[x+2,y+11],[x,y+8],[x,y+2]])
  block(ctx, p.eye, x + 1, y + 3, 6, 6)
  block(ctx, p.eyeLight, x + 2, y + 8, 4, 2)
  block(ctx, p.pupil, x + 3, y + 2, 2, 5)
  block(ctx, p.white, x + 1, y + 2, 2, 2)
  block(ctx, p.hairGlint, x + 5, y + 7, 1, 1)
}
export function leftEye(ctx: CanvasRenderingContext2D, frame: PixelPetFrame) { eye(ctx, 101, 79, frame) }
export function rightEye(ctx: CanvasRenderingContext2D, frame: PixelPetFrame) { eye(ctx, 141, 77, frame) }
