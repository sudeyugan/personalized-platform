import type { PixelPetFrame } from './types'
import { block, palette as p, polygon } from './pixelPrimitives'

export function face(ctx: CanvasRenderingContext2D) {
  polygon(ctx, p.outline, [[96,46],[145,36],[163,42],[176,63],[173,100],[162,117],[145,129],[123,126],[103,115],[91,95],[89,65]])
  polygon(ctx, p.skinShadow, [[97,48],[145,40],[161,45],[171,63],[169,99],[158,115],[145,125],[125,122],[106,110],[95,93],[94,64]])
  polygon(ctx, p.skin, [[98,52],[143,43],[158,48],[167,63],[166,98],[156,112],[144,122],[125,119],[109,108],[98,91]])
  polygon(ctx, p.skinLight, [[111,57],[143,47],[159,58],[163,92],[151,111],[137,116],[119,109],[108,92]])
  block(ctx, p.blush, 103, 94, 8, 2)
  block(ctx, p.blush, 152, 92, 8, 2)
  block(ctx, p.skinShadow, 132, 94, 2, 3)
  block(ctx, p.skinShadow, 128, 109, 8, 1)
  block(ctx, p.skinLight, 130, 110, 4, 1)
}

function eye(ctx: CanvasRenderingContext2D, x: number, y: number, frame: PixelPetFrame) {
  block(ctx, p.skinShadow, x + 1, y - 5, 14, 1)
  const height = Math.round(11 * frame.eyeOpen)
  if (height <= 1) {
    block(ctx, p.outline, x, y + 3, 17, 2)
    block(ctx, p.outline, x - 2, y + 2, 4, 1)
    return
  }
  const top = y + Math.round((11 - height) / 2)
  ctx.save()
  ctx.beginPath(); ctx.rect(x, top, 18, height); ctx.clip()
  polygon(ctx, p.white, [[x,y+1],[x+4,y],[x+13,y],[x+18,y+3],[x+16,y+10],[x+4,y+11],[x,y+7]])
  iris(ctx, x + 6 + frame.gaze.x, y + 1 + frame.gaze.y)
  ctx.restore()
  block(ctx, p.outline, x, top, 16, 2)
  block(ctx, p.outline, x - 2, top - 1, 4, 2)
  block(ctx, p.inkLight, x + 16, top + 1, 2, 2)
  block(ctx, p.skinShadow, x + 2, top + height, 13, 1)
}
export function iris(ctx: CanvasRenderingContext2D, x: number, y: number) {
  block(ctx, p.blueDeep, x, y, 8, 9)
  block(ctx, p.eye, x + 1, y + 2, 6, 7)
  block(ctx, p.eyeLight, x + 2, y + 6, 4, 2)
  block(ctx, p.pupil, x + 3, y + 1, 2, 5)
  block(ctx, p.white, x + 1, y + 1, 2, 2)
  block(ctx, p.white, x + 6, y + 5, 1, 1)
}
export function leftEye(ctx: CanvasRenderingContext2D, frame: PixelPetFrame) { eye(ctx, 102, 73, frame) }
export function rightEye(ctx: CanvasRenderingContext2D, frame: PixelPetFrame) { eye(ctx, 145, 71, frame) }
