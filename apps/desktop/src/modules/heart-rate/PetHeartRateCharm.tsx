import { PetHeartRateCorner } from './PetHeartRateCorner'
import { WebMHeartRateLabel } from './WebMHeartRateLabel'
import type { CompanionHeartRateInput } from './companionHeartRate'
import type { CompanionPetStyle } from '../../domain/models'
import type { PixelPetPose } from '../companion/pixel-pet/types'
import './petHeartRate.css'

/** Shared data, separate presentations; neither is a health meter or ECG. */
export function PetHeartRateCharm({ bpm, label, variant, pose, style = 'chibi', rate = 1, input }: {
  bpm: number | null; label: string; variant: 'pixel' | 'webm'; pose: PixelPetPose
  style?: CompanionPetStyle; rate?: number; input?: CompanionHeartRateInput
}) {
  return variant === 'pixel' ? <PetHeartRateCorner bpm={bpm} label={label} pose={pose} style={style} rate={rate} input={input} />
    : <WebMHeartRateLabel bpm={bpm} label={label} rate={rate} />
}
