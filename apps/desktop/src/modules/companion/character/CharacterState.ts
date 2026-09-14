import type { EyeState } from '../animation/BlinkController'
import type { MouthState } from '../animation/MouthController'

export type CharacterMode = 'idle' | 'talking' | 'motion' | 'sleeping'
export interface CharacterState {
  mode: CharacterMode
  expression: string
  blinking: boolean
  eyeState: EyeState
  mouthState: MouthState
  currentMotion?: string
  motionFrame: number
}

export const initialCharacterState: CharacterState = { mode: 'idle', expression: 'neutral', blinking: false, eyeState: 'open', mouthState: 'closed', motionFrame: 0 }
