import { PIXEL_PET_SIZE, type PixelPetFrame, type PixelPetPose } from './types'
import { backHair, frontHair, hairAccessory } from './hairParts'
import { face, leftEye, rightEye } from './faceParts'
import { torso, leftArm, rightArm, leftHand, rightHand } from './bodyParts'

export const pixelPetPoseRenderers: Partial<Record<PixelPetPose, (ctx: CanvasRenderingContext2D, frame: PixelPetFrame) => void>> = {
  'right-edge': (ctx, frame) => {
    ctx.save(); ctx.translate(Math.round(frame.hair.x), Math.round(frame.hair.y)); backHair(ctx); ctx.restore()
    ctx.save(); ctx.translate(0, Math.round(frame.breath)); torso(ctx); ctx.restore()
    ctx.save()
    ctx.translate(Math.round(frame.head.x), Math.round(frame.head.y))
    face(ctx); leftEye(ctx, frame); rightEye(ctx, frame); frontHair(ctx); hairAccessory(ctx)
    ctx.restore()
    leftArm(ctx); rightArm(ctx); leftHand(ctx); rightHand(ctx)
  },
}
export function drawPixelPet(ctx: CanvasRenderingContext2D, frame: PixelPetFrame, pose: PixelPetPose = 'right-edge') {
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, PIXEL_PET_SIZE.width, PIXEL_PET_SIZE.height)
  const renderer = pixelPetPoseRenderers[pose]
  if (!renderer) throw new Error(`Pixel Pet pose not implemented: ${pose}`)
  renderer(ctx, frame)
}
