import type { PixelPoint } from '../../types'
import type { FaceAttention } from './types'

const clamp = (value: number) => Math.max(-1, Math.min(1, value))

// Amplify small, already-smoothed/calibrated face displacements only at the
// animation boundary. No new capture, storage, or remote processing.
export function cameraLook(now: number, face: FaceAttention | null, center: PixelPoint, leftEdge = false) {
  if (!face?.present || ![face.x, face.y, face.yaw, face.pitch, face.at].every(Number.isFinite)
    || now - face.at > 1800 || face.at - now > 100) return null
  const direction = leftEdge ? -1 : 1
  const x = clamp(face.x * direction * 3.2), y = clamp(face.y * 2.4)
  return {
    target: { x: center.x + x * 100, y: center.y + y * 90 },
    // Position leads; small orientation changes add a bounded head response,
    // never a hard switch of the entire pose or an eye-gaze accuracy claim.
    headLook: { x: clamp(x + clamp(face.yaw * direction / .5) * .2), y: clamp(y + clamp(face.pitch / .5) * .15) },
  }
}
