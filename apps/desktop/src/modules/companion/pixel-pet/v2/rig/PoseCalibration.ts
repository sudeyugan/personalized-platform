import { artEyeCenter, artPlacement, type ArtProfile } from '../../art/artProfiles'

export function calibratePose(neutral: ArtProfile, pose: ArtProfile) {
  const [n1, n2] = neutral.eyes, [p1, p2] = pose.eyes
  const sourceSpan = Math.hypot(p2.x - p1.x, p2.y - p1.y)
  if (!(sourceSpan > 0)) throw new Error('无效的动作头部校准')
  const scale = Math.hypot(n2.x - n1.x, n2.y - n1.y) * artPlacement(neutral).scale / sourceSpan
  const center = artEyeCenter(neutral)
  return { scale, x: center.x - (p1.x + p2.x) * .5 * scale, y: center.y - (p1.y + p2.y) * .5 * scale }
}
