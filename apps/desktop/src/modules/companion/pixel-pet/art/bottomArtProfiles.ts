import type { CompanionPetStyle } from '../../../../domain/models'
import type { ArtProfile } from './artProfiles'

// New static mother textures; each pose has its own source-eye calibration.
export const BOTTOM_ART_PROFILES: Record<CompanionPetStyle, ArtProfile> = {
  detailed: {
    style: 'detailed', label: '精细插画', src: new URL('./assets/detailed-bottom-v1.png', import.meta.url).href,
    width: 1024, height: 1536, edgeX: 512, edgeY: 1315, pixelated: false,
    hands: [[[.05, .75], [.95, .75], [.95, .87], [.05, .87]]],
    eyes: [
      { x: 465, y: 650, rx: 48, ry: 24, angle: -.3, irisX: 462, irisY: 649, irisRx: 32, irisRy: 29 },
      { x: 655, y: 580, rx: 49, ry: 26, angle: -.34, irisX: 655, irisY: 579, irisRx: 31, irisRy: 29 },
    ],
  },
  pixel: {
    style: 'pixel', label: '像素半身', src: new URL('./assets/pixel-bottom-v1.png', import.meta.url).href,
    width: 1024, height: 1536, edgeX: 512, edgeY: 1280, pixelated: true,
    hands: [[[.02, .75], [.98, .75], [.98, .84], [.02, .84]]],
    eyes: [
      { x: 464, y: 720, rx: 49, ry: 24, angle: -.28, irisX: 468, irisY: 718, irisRx: 33, irisRy: 30 },
      { x: 662, y: 646, rx: 50, ry: 28, angle: -.37, irisX: 664, irisY: 646, irisRx: 32, irisRy: 30 },
    ],
  },
  chibi: {
    style: 'chibi', label: 'Q 版', src: new URL('./assets/chibi-bottom-v1.png', import.meta.url).href,
    width: 1122, height: 1402, edgeX: 561, edgeY: 1286, pixelated: true,
    hands: [[[.03, .83], [.97, .83], [.97, .92], [.03, .92]]],
    eyes: [
      { x: 540, y: 751, rx: 66, ry: 43, angle: -.28, irisX: 550, irisY: 744, irisRx: 47, irisRy: 46 },
      { x: 781, y: 667, rx: 64, ry: 44, angle: -.35, irisX: 782, irisY: 666, irisRx: 48, irisRy: 45 },
    ],
  },
}
