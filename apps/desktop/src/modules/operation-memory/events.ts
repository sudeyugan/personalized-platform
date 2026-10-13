import type { OperationDraft } from '../../domain/operations/types'

export const operationMemoryEvent = 'yiyu:operation-memory'
export type OperationMemoryRequest = { mode: 'library' } | { mode: 'edit'; draft: OperationDraft } | { mode: 'run'; id: string; revision: number }
export function openOperationMemory(detail: OperationMemoryRequest) {
  window.dispatchEvent(new CustomEvent(operationMemoryEvent, { detail }))
}
