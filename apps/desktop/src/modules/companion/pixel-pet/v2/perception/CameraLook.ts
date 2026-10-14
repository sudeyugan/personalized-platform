import type { PixelPoint } from '../../types'
import type { FaceAttention } from './types'

// Amplify small, already-smoothed/calibrated face displacements only at the
// animation boundary. No new capture, storage, or remote processing.
export function cameraLook(now: number, face: FaceAttention | null, center: PixelPoint, leftEdge = false) {
  if (!face?.present || ![face.x, face.y, face.yaw, face.pitch, face.at].every(Number.isFinite)
    || now - face.at > 1800 || face.at - now > 100) return null
  const direction = leftEdge ? -1 : 1
  // A smooth saturating response preserves the difference between ordinary
  // side positions, unlike a large linear gain that hits the stop too early.
  const x = Math.tanh(face.x * direction * 2.5), y = Math.tanh(face.y * 1.8)
  return {
    target: { x: center.x + x * 100, y: center.y + y * 90 },
    // Look AT the person, do not imitate their head yaw. Someone at the right
    // may turn left to look at the monitor; their pose must not reverse our aim.
    headLook: { x, y },
  }
}
