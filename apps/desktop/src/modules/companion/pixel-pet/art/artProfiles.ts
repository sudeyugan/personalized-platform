import type { CompanionPetStyle } from '../../../../domain/models'
import type { PixelPoint } from '../types'

export interface ArtEye {
  x: number; y: number; rx: number; ry: number; angle: number
  irisX: number; irisY: number; irisRx: number; irisRy: number
}
export type ArtPolygon = [number, number][]
export interface ArtProfile {
  style: CompanionPetStyle; label: string; src: string
  width: number; height: number; edgeX: number; edgeY?: number; floating?: boolean; pixelated: boolean
  hands: ArtPolygon[]; eyes: ArtEye[]
}
const hands: ArtPolygon[] = [
  [[.87, .37], [1, .37], [1, .49], [.90, .49]],
  [[.86, .58], [1, .58], [1, .75], [.89, .75]],
]
export const ART_PROFILES: Record<CompanionPetStyle, ArtProfile> = {
  detailed: {
    style: 'detailed', label: '精细插画', src: new URL('./assets/detailed.png', import.meta.url).href,
    width: 1024, height: 1536, edgeX: 948, pixelated: false, hands,
    eyes: [
      { x: 535, y: 475, rx: 47, ry: 23, angle: -.25, irisX: 542, irisY: 475, irisRx: 29, irisRy: 25 },
      { x: 706, y: 408, rx: 44, ry: 27, angle: -.40, irisX: 709, irisY: 412, irisRx: 28, irisRy: 27 },
    ],
  },
  pixel: {
    style: 'pixel', label: '像素半身', src: new URL('./assets/pixel.png', import.meta.url).href,
    width: 1024, height: 1536, edgeX: 966, pixelated: true, hands,
    eyes: [
      { x: 540, y: 496, rx: 46, ry: 23, angle: -.29, irisX: 541, irisY: 494, irisRx: 33, irisRy: 28 },
      { x: 706, y: 434, rx: 44, ry: 26, angle: -.40, irisX: 711, irisY: 431, irisRx: 31, irisRy: 30 },
    ],
  },
  chibi: {
    style: 'chibi', label: 'Q 版', src: new URL('./assets/chibi.png', import.meta.url).href,
    width: 1122, height: 1402, edgeX: 1015, pixelated: true,
    hands: [
      [[.87, .47], [1, .47], [1, .59], [.90, .59]],
      [[.85, .61], [1, .61], [1, .75], [.87, .75]],
    ],
    eyes: [
      { x: 573, y: 633, rx: 60, ry: 39, angle: -.33, irisX: 587, irisY: 633, irisRx: 43, irisRy: 42 },
      { x: 787, y: 543, rx: 59, ry: 42, angle: -.42, irisX: 800, irisY: 542, irisRx: 45, irisRy: 47 },
    ],
  },
}
export const PET_STYLES = Object.values(ART_PROFILES)
export function artPlacement(profile: ArtProfile) {
  if (profile.floating) {
    const scale = Math.min(188 / profile.width, 236 / profile.height)
    return { scale, x: (192 - profile.width * scale) / 2, y: 2 }
  }
  if (profile.edgeY) {
    const scale = Math.min(188 / profile.width, 236 / profile.edgeY)
    return { scale, x: (192 - profile.width * scale) / 2, y: 240 - profile.edgeY * scale }
  }
  const scale = Math.min(188 / profile.width, 236 / profile.height)
  // Anchor the grasped edge, not the PNG's transparent bounding rectangle.
  // Finger tips and ribbon ends may intentionally extend beyond the right clip.
  return { scale, x: 192 - profile.edgeX * scale, y: 2 }
}
export function artEyeCenter(profile: ArtProfile): PixelPoint {
  const placement = artPlacement(profile)
  return {
    x: placement.x + profile.eyes.reduce((n, eye) => n + eye.x, 0) / profile.eyes.length * placement.scale,
    y: placement.y + profile.eyes.reduce((n, eye) => n + eye.y, 0) / profile.eyes.length * placement.scale,
  }
}
