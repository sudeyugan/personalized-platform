import type { CompanionPetStyle } from '../../../../domain/models'
import { FREE_ART_PROFILES } from './freeArtProfiles'
import { BOTTOM_ART_PROFILES } from './bottomArtProfiles'
import type { PixelPetPose } from '../types'
import { ART_PROFILES, artPlacement, type ArtProfile } from './artProfiles'
import { prepareEye, type PreparedEye } from './eyeRaster'
import { prepareArtRows, type ArtRow } from './deformation'

export interface PreparedArt {
  profile: ArtProfile; resolution: number
  source: HTMLCanvasElement; working: HTMLCanvasElement; ctx: CanvasRenderingContext2D
  eyes: PreparedEye[]; rows: ArtRow[]
}
const cache = new Map<string, Promise<PreparedArt>>()
async function prepare(profile: ArtProfile): Promise<PreparedArt> {
  const image = new Image()
  image.src = profile.src
  await image.decode()
  if (image.naturalWidth !== profile.width || image.naturalHeight !== profile.height) throw new Error('桌宠素材尺寸与校准配置不符')
  // Preserve the approved source colour/alpha and detailed eye texture in all three styles.
  const resolution = 3
  const source = document.createElement('canvas'); source.width = 192 * resolution; source.height = 240 * resolution
  const sourceCtx = source.getContext('2d', { willReadFrequently: true })
  const working = document.createElement('canvas'); working.width = source.width; working.height = source.height
  const ctx = working.getContext('2d')
  if (!sourceCtx || !ctx) throw new Error('当前环境不支持 Canvas 2D')
  const fit = artPlacement(profile)
  sourceCtx.imageSmoothingEnabled = !profile.pixelated
  sourceCtx.drawImage(image, fit.x * resolution, fit.y * resolution, profile.width * fit.scale * resolution, profile.height * fit.scale * resolution)
  const pixels = sourceCtx.getImageData(0, 0, source.width, source.height)
  return { profile, resolution, source, working, ctx,
    eyes: profile.eyes.map((eye) => prepareEye(pixels, eye, profile, resolution)),
    rows: prepareArtRows(profile, resolution),
  }
}
export function loadPreparedArt(style: CompanionPetStyle, pose: PixelPetPose = 'right-edge') {
  const key = `${style}:${pose === 'float' ? 'free' : pose === 'bottom-edge' ? 'bottom' : 'side'}`
  let pending = cache.get(key)
  if (!pending) {
    pending = prepare(pose === 'float' ? FREE_ART_PROFILES[style] : pose === 'bottom-edge' ? BOTTOM_ART_PROFILES[style] : ART_PROFILES[style]).catch((error: unknown) => { cache.delete(key); throw error })
    cache.set(key, pending)
  }
  return pending
}
