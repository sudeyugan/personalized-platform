export const PIXEL_PET_SIZE = { width: 192, height: 240 } as const

// Only right-edge is implemented; other poses are explicit future extension points.
export type PixelPetPose = 'right-edge' | 'left-edge' | 'bottom-edge' | 'peek' | 'sleep'
export interface PixelPoint { x: number; y: number }
export type PixelBlinkPhase = 'open' | 'closing' | 'closed' | 'opening'
export interface PixelPetFrame {
  gaze: PixelPoint
  eyeOpen: number
  blinkPhase: PixelBlinkPhase
  breath: number
  head: PixelPoint
  hair: PixelPoint
}
