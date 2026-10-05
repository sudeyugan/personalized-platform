export const PIXEL_PET_SIZE = { width: 192, height: 240 } as const

// Left/right edges share the calibrated art; the other poses remain extension points.
export type PixelPetPose = 'right-edge' | 'left-edge' | 'bottom-edge' | 'float' | 'peek' | 'sleep'
export interface PixelPoint { x: number; y: number }
export type PixelBlinkPhase = 'open' | 'closing' | 'closed' | 'opening'
export interface PixelPetFrame {
  gaze: PixelPoint
  eyeOpen: number
  blinkPhase: PixelBlinkPhase
  tilt?: number
  breath: number
  head: PixelPoint
  hair: PixelPoint
}
