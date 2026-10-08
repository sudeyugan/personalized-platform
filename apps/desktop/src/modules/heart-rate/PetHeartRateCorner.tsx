import type { CompanionHeartRateInput } from './companionHeartRate'
import type { CompanionPetStyle } from '../../domain/models'
import type { PixelPetPose } from '../companion/pixel-pet/types'
import { HeartRateSymbol } from './HeartRateSymbol'

export function PetHeartRateCorner({ bpm, label, pose, style, rate, input }: {
  bpm: number | null; label: string; pose: PixelPetPose; style: CompanionPetStyle; rate: number; input?: CompanionHeartRateInput
}) {
  return <span ref={input?.marker} className="companion-heart-rate pet-heart-corner" data-style={style} data-pose={pose} data-live={bpm !== null} role="status" aria-label={label}>
    <HeartRateSymbol live={bpm !== null} rate={rate} pixel={style === 'pixel'} /><strong>{bpm ?? '—'}</strong>
  </span>
}
