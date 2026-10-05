import type { CompanionPetSide, CompanionPetStyle } from './models'

export function normalizeCompanionPetStyle(value: unknown): CompanionPetStyle {
  return value === 'detailed' || value === 'pixel' || value === 'chibi' ? value : 'chibi'
}

export function normalizeCompanionPetSide(value: unknown): CompanionPetSide {
  return value === 'left-edge' || value === 'bottom-edge' ? value : 'right-edge'
}
