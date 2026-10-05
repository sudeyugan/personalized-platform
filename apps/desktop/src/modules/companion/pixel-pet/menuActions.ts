import type { CompanionPetSide, CompanionPetStyle } from '../../../domain/models'

export type PetMenuAction = { kind: 'style'; value: CompanionPetStyle } | { kind: 'side'; value: CompanionPetSide } | { kind: 'settings' } | { kind: 'hide' }
export function validPetMenuAction(value: unknown): value is PetMenuAction {
  if (!value || typeof value !== 'object') return false
  const action = value as { kind?: unknown; value?: unknown }
  return action.kind === 'settings' || action.kind === 'hide'
    || action.kind === 'style' && typeof action.value === 'string' && ['detailed', 'pixel', 'chibi'].includes(action.value)
    || action.kind === 'side' && typeof action.value === 'string' && ['right-edge', 'left-edge', 'bottom-edge'].includes(action.value)
}
