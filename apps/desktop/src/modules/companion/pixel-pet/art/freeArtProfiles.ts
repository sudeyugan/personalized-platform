import type { CompanionPetStyle } from '../../../../domain/models'
import type { ArtProfile } from './artProfiles'

// Relaxed half-body poses, not side-grip images suspended in empty space.
export const FREE_ART_PROFILES: Record<CompanionPetStyle, ArtProfile> = {
  detailed: {
    style: 'detailed', label: '精细插画', src: new URL('./assets/detailed-free-v1.png', import.meta.url).href,
    width: 1024, height: 1536, edgeX: 512, floating: true, pixelated: false, hands: [],
    eyes: [
      { x: 470, y: 471, rx: 49, ry: 25, angle: -.3, irisX: 470, irisY: 473, irisRx: 30, irisRy: 27 },
      { x: 637, y: 408, rx: 47, ry: 27, angle: -.35, irisX: 638, irisY: 408, irisRx: 30, irisRy: 28 },
    ],
  },
  pixel: {
    style: 'pixel', label: '像素半身', src: new URL('./assets/pixel-free-v1.png', import.meta.url).href,
    width: 1024, height: 1536, edgeX: 512, floating: true, pixelated: true, hands: [],
    eyes: [
      { x: 465, y: 489, rx: 49, ry: 25, angle: -.3, irisX: 466, irisY: 488, irisRx: 31, irisRy: 28 },
      { x: 638, y: 421, rx: 49, ry: 28, angle: -.35, irisX: 639, irisY: 420, irisRx: 31, irisRy: 29 },
    ],
  },
  chibi: {
    style: 'chibi', label: 'Q 版', src: new URL('./assets/chibi-free-v1.png', import.meta.url).href,
    width: 1122, height: 1402, edgeX: 561, floating: true, pixelated: true, hands: [],
    eyes: [
      { x: 510, y: 619, rx: 66, ry: 42, angle: -.3, irisX: 521, irisY: 620, irisRx: 45, irisRy: 45 },
      { x: 733, y: 537, rx: 64, ry: 44, angle: -.35, irisX: 733, irisY: 534, irisRx: 46, irisRy: 45 },
    ],
  },
}
