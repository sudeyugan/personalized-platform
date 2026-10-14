import type { PreparedArt } from '../../art/prepareArt'
import { prepareEye } from '../../art/eyeRaster'

// Legacy owns its GPU-backed expression canvas. V2 reads expressions back on
// every frame, so use an independent CPU surface instead of changing that cache.
export function prepareRigNeutral(neutral: PreparedArt): PreparedArt {
  const working = document.createElement('canvas')
  working.width = neutral.source.width; working.height = neutral.source.height
  const ctx = working.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D不可用')
  const pixels = neutral.source.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, working.width, working.height)
  return { ...neutral, working, ctx,
    eyes: neutral.profile.eyes.map(eye => prepareEye(pixels, eye, neutral.profile, neutral.resolution, true)) }
}
