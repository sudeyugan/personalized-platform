import type { PixelPoint, PixelPetPose } from '../../types'
import type { FaceAttention } from './types'

function placementAim(pose: PixelPetPose) {
  // The camera/person is above the monitor. Bottom grip looks up; side grips
  // face gently into the screen. Values are local to the unmirrored artwork.
  return pose === 'bottom-edge' ? { x: 0, y: -.8 }
    : pose === 'left-edge' || pose === 'right-edge' ? { x: -.18, y: -.22 } : { x: 0, y: -.12 }
}
export function restingLook(center: PixelPoint, pose: PixelPetPose) {
  const aim = placementAim(pose), x = Math.tanh(aim.x), y = Math.tanh(aim.y)
  return { target: { x: center.x + x * 100, y: center.y + y * 90 }, headLook: { x, y } }
}

// Reduce the displacement around the placement baseline, not the baseline
// itself: bottom/side grips still look at the person when they sit centered.
function follow(displacement: number, aim: number) {
  const rest = Math.tanh(aim)
  return rest + .85 * (Math.tanh(displacement + aim) - rest)
}
// Apply only at the animation boundary, after local smoothing/calibration.
export function cameraLook(now: number, face: FaceAttention | null, center: PixelPoint, pose: PixelPetPose = 'float') {
  if (!face?.present || ![face.x, face.y, face.yaw, face.pitch, face.at].every(Number.isFinite)
    || now - face.at > 1800 || face.at - now > 100) return null
  const direction = pose === 'left-edge' ? -1 : 1, aim = placementAim(pose)
  // A smooth saturating response preserves the difference between ordinary
  // side positions, unlike a large linear gain that hits the stop too early.
  const x = follow(face.x * direction * 2.5, aim.x), y = follow(face.y * 1.8, aim.y)
  return {
    target: { x: center.x + x * 100, y: center.y + y * 90 },
    // Look AT the person, do not imitate their head yaw. Someone at the right
    // may turn left to look at the monitor; their pose must not reverse our aim.
    headLook: { x, y },
  }
}
