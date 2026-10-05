import type { CompanionPetSide } from '../../../domain/models'
import { PIXEL_PET_SIZE, type PixelPoint } from './types'

// Art stays in its calibrated right-edge space; mirror input and output together.
export function posePointer(pointer: PixelPoint | null, side: CompanionPetSide): PixelPoint | null {
  return pointer && side === 'left-edge' ? { x: PIXEL_PET_SIZE.width - pointer.x, y: pointer.y } : pointer
}
export function applyPoseTransform(ctx: CanvasRenderingContext2D, side: CompanionPetSide) {
  ctx.setTransform(side === 'left-edge' ? -3 : 3, 0, 0, 3, side === 'left-edge' ? PIXEL_PET_SIZE.width * 3 : 0, 0)
}
