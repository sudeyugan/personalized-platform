import type { CompanionPetStyle } from '../../../domain/models'
import { ART_PROFILES, artEyeCenter, artPlacement } from './art/artProfiles'
import { BOTTOM_ART_PROFILES } from './art/bottomArtProfiles'
import { FREE_ART_PROFILES } from './art/freeArtProfiles'
import { posePointer } from './pose'
import type { PixelPoint, PixelPetPose } from './types'

export function isPetHead(point: PixelPoint | undefined, style: CompanionPetStyle, pose: PixelPetPose) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false
  const profile = pose === 'float' ? FREE_ART_PROFILES[style] : pose === 'bottom-edge' ? BOTTOM_ART_PROFILES[style] : ART_PROFILES[style]
  const local = posePointer(point, pose === 'left-edge' ? 'left-edge' : 'right-edge'), center = artEyeCenter(profile), fit = artPlacement(profile)
  if (!local || local.x < 0 || local.x > 192 || local.y < fit.y + 3 || local.y > 240) return false
  const rx = Math.max(17, Math.abs(profile.eyes[1].x - profile.eyes[0].x) * fit.scale * .9 + 10)
  const ry = style === 'chibi' ? 45 : 35
  return ((local.x - center.x) / rx) ** 2 + ((local.y - (center.y - 12)) / ry) ** 2 <= 1
}
