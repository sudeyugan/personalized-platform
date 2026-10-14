import { artPlacement, type ArtProfile } from '../../art/artProfiles'
import { FREE_ART_PROFILES } from '../../art/freeArtProfiles'
import type { PreparedArt } from '../../art/prepareArt'
import type { RigPose } from '../animation/types'
import { smooth } from './PixelRig'

export type RigArt = PreparedArt & { gesture?: { x: number; y: number; cx: number; cy: number; rx: number; ry: number } }

// Coordinates are in the independent PNGs, not in the old neutral/free texture.
const centers: Record<Exclude<RigPose, 'neutral'>, [number, number, number, number]> = {
  wave: [471, 487, 644, 426], 'touch-hair': [472, 487, 643, 425],
  chin: [471, 487, 644, 426], stretch: [471, 487, 644, 426], sleep: [471, 487, 644, 426],
}
export function poseArtProfile(name: Exclude<RigPose, 'neutral'>, src: string): ArtProfile {
  const [x1, y1, x2, y2] = centers[name]
  return { ...FREE_ART_PROFILES.pixel, label: '像素2.0', src,
    eyes: FREE_ART_PROFILES.pixel.eyes.map((eye, index) => {
      const x = index ? x2 : x1, y = index ? y2 : y1
      return { ...eye, x, y, irisX: x + 1, irisY: y - 1 }
    }) }
}

// Eye-only fitting leaves a straight free torso hanging away from a side grip.
// Preserve the entire head; smoothly align the chest to the neutral's lean.
// This is a continuous scanline translation, never independent cut-out body parts.
export function poseBodyOffset(y: number, neutral: ArtProfile, profile: ArtProfile) {
  if (neutral.floating || neutral.edgeY) return 0
  const fit = artPlacement(profile), base = artPlacement(neutral)
  const chestOffset = base.x + 835 * base.scale - (fit.x + 650 * fit.scale)
  return chestOffset * smooth(fit.y + 620 * fit.scale, fit.y + 950 * fit.scale, y)
}
export function waveGesture(neutral: ArtProfile, profile: ArtProfile) {
  const fit = artPlacement(profile), y = fit.y + 780 * fit.scale
  return { x: fit.x + 260 * fit.scale + poseBodyOffset(y, neutral, profile), y,
    cx: fit.x + 220 * fit.scale + poseBodyOffset(fit.y + 690 * fit.scale, neutral, profile), cy: fit.y + 690 * fit.scale,
    rx: 175 * fit.scale, ry: 240 * fit.scale }
}
export function gestureWeight(x: number, y: number, gesture: NonNullable<RigArt['gesture']>) {
  const radius = Math.hypot((x - gesture.cx) / gesture.rx, (y - gesture.cy) / gesture.ry)
  return 1 - smooth(.7, 1.25, radius)
}
