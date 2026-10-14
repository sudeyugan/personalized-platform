import type { ArtProfile } from '../../art/artProfiles'
import { prepareArtRows } from '../../art/deformation'
import { prepareEye } from '../../art/eyeRaster'
import { loadPreparedArt,type PreparedArt } from '../../art/prepareArt'
import type { PixelPetPose } from '../../types'
import type { RigPose } from '../animation/types'
import { calibratePose } from './PoseCalibration'
import { poseArtProfile, poseBodyOffset, waveGesture, type RigArt } from './PoseAppearance'
import { prepareRigNeutral } from './prepareRigNeutral'

const sources: Record<Exclude<RigPose, 'neutral'>, string> = {
  wave: new URL('./assets/wave-v3.png', import.meta.url).href,
  'touch-hair': new URL('./assets/touch-hair-v3.png', import.meta.url).href,
  chin: new URL('./assets/chin-v3.png', import.meta.url).href,
  stretch: new URL('./assets/stretch-v3.png', import.meta.url).href,
  sleep: new URL('./assets/sleep-v3.png', import.meta.url).href,
}
const cache = new Map<PixelPetPose, Promise<Map<RigPose, RigArt>>>()

async function preparePose(name: Exclude<RigPose, 'neutral'>, neutral: PreparedArt): Promise<RigArt> {
  const image = new Image(); image.src = sources[name]; await image.decode()
  if (image.naturalWidth !== 1024 || image.naturalHeight !== 1536) throw new Error('动作原画尺寸与校准不符')
  const profile: ArtProfile = poseArtProfile(name, sources[name])
  profile.placement = calibratePose(neutral.profile, profile)
  const source = document.createElement('canvas'), working = document.createElement('canvas'), resolution = 3
  source.width = working.width = 576; source.height = working.height = 720
  const sourceCtx = source.getContext('2d', { willReadFrequently: true }), ctx = working.getContext('2d', { willReadFrequently: true })
  if (!sourceCtx || !ctx) throw new Error('Canvas 2D不可用')
  const { scale, x, y } = profile.placement
  sourceCtx.imageSmoothingEnabled = false
  if (neutral.profile.floating || neutral.profile.edgeY) {
    sourceCtx.drawImage(image, x * 3, y * 3, profile.width * scale * 3, profile.height * scale * 3)
  } else {
    for (let row = 0; row < source.height; row++) {
      const sourceY = (row / resolution - y) / scale
      if (sourceY < 0 || sourceY >= profile.height) continue
      sourceCtx.drawImage(image, 0, sourceY, profile.width, Math.min(1 / (scale * resolution), profile.height - sourceY),
        (x + poseBodyOffset(row / resolution, neutral.profile, profile)) * resolution, row, profile.width * scale * resolution, 1)
    }
  }
  const pixels = sourceCtx.getImageData(0, 0, 576, 720)
  return { profile, resolution, source, working, ctx,
    eyes: name === 'sleep' || name === 'stretch' ? [] : profile.eyes.map(eye => prepareEye(pixels, eye, profile, resolution, true)),
    rows: prepareArtRows(profile, resolution), gesture: name === 'wave' ? waveGesture(neutral.profile, profile) : undefined }
}

export function loadRigAssets(pose: PixelPetPose) {
  const key = pose === 'left-edge' ? 'right-edge' : pose
  let pending = cache.get(key)
  if (!pending) {
    pending = loadPreparedArt('pixel', pose).then(async original => {
      const neutral = prepareRigNeutral(original)
      const entries = await Promise.all((Object.keys(sources) as Exclude<RigPose, 'neutral'>[]).map(async name => [name, await preparePose(name, neutral)] as const))
      return new Map<RigPose, RigArt>([...entries, ['neutral', neutral]])
    }).catch(error => { if (cache.get(key) === pending) cache.delete(key); throw error })
    cache.set(key, pending)
    if (cache.size > 2) cache.delete(cache.keys().next().value!)
  }
  return pending
}
