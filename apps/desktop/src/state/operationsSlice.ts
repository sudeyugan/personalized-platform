import type { LearnedOperation, OperationDraft, OperationRunRecord } from '../domain/operations/types'
import { validateOperationDraft } from '../domain/operations/method'
import type { LibraryStore } from './libraryStoreTypes'
import { normalizeOperationLearning, validOperationPattern } from '../domain/operations/learning'
import { commitLibraryData, type LibraryStoreSetter } from './persistence'

export interface OperationsActions {
  learnOperation(draft: OperationDraft, pattern: string): LearnedOperation | undefined
  setOperationLearning(enabled: boolean): void
  saveOperation(draft: OperationDraft, id?: string, expectedRevision?: number): LearnedOperation
  setOperationEnabled(id: string, revision: number, enabled: boolean): void
  deleteOperation(id: string, revision: number): void
  recordOperationRun(id: string, revision: number, status: OperationRunRecord['status'], toolCount: number, runId?: string): string | undefined
}
export function createOperationsSlice(get: () => LibraryStore, set: LibraryStoreSetter): OperationsActions {
  const write = (operations: LearnedOperation[]) => { const data = get().data; commitLibraryData({ ...data, companion: { ...data.companion, operations } }, set) }
  const requireCurrent = (id: string, revision: number) => {
    const current = get().data.companion.operations?.find(item => item.id === id)
    if (!current || current.revision !== revision) throw new Error('方法已改变，请重新打开，避免覆盖新版本')
    return current
  }
  return {
    saveOperation(draft, id, expectedRevision) {
      const clean = validateOperationDraft(draft)
      const operations = get().data.companion.operations ?? []
      const previous = id ? requireCurrent(id, expectedRevision ?? 0) : undefined
      if (!previous && operations.length >= 100) throw new Error('方法库已满，请先删除不用的方法（最多100个）')
      const now = new Date().toISOString()
      const item: LearnedOperation = { ...clean, id: previous?.id ?? `operation-${crypto.randomUUID()}`, revision: (previous?.revision ?? 0) + 1, enabled: previous?.enabled ?? true, createdAt: previous?.createdAt ?? now, updatedAt: now, runs: previous?.runs ?? [], ...(previous?.pattern ? { pattern: previous.pattern, source: 'manual' as const } : {}) }
      write(previous ? operations.map(old => old.id === item.id ? item : old) : [...operations, item])
      return item
    },
    setOperationEnabled(id, revision, enabled) { requireCurrent(id, revision); write((get().data.companion.operations ?? []).map(item => item.id === id ? { ...item, enabled, revision: item.revision + 1, updatedAt: new Date().toISOString() } : item)) },
    learnOperation(draft, pattern) {
      const data = get().data, learning = normalizeOperationLearning(data.companion.operationLearning)
      if (!learning.enabled || !validOperationPattern(pattern) || learning.ignoredPatterns.includes(pattern)) return
      const existing = data.companion.operations?.find(item => item.pattern === pattern)
      if (existing) return existing.enabled ? existing : undefined
      if ((data.companion.operations?.length ?? 0) >= 100) return
      const clean = validateOperationDraft(draft), now = new Date().toISOString()
      const item: LearnedOperation = { ...clean, id: `operation-${crypto.randomUUID()}`, revision: 1, enabled: true, source: 'automatic', pattern, createdAt: now, updatedAt: now, runs: [] }
      write([...(data.companion.operations ?? []), item]); return item
    },
    setOperationLearning(enabled) { const data = get().data; commitLibraryData({ ...data, companion: { ...data.companion, operationLearning: { ...normalizeOperationLearning(data.companion.operationLearning), enabled } } }, set) },
    deleteOperation(id, revision) {
      const item = requireCurrent(id, revision), data = get().data, learning = normalizeOperationLearning(data.companion.operationLearning)
      commitLibraryData({ ...data, companion: { ...data.companion, operations: (data.companion.operations ?? []).filter(item => item.id !== id), operationLearning: item.pattern ? { ...learning, ignoredPatterns: [...new Set([...learning.ignoredPatterns, item.pattern])].slice(-100) } : learning } }, set)
    },
    recordOperationRun(id, revision, status, toolCount, runId) {
      if (!['awaiting_review', 'confirmed', 'handoff', 'error', 'cancelled'].includes(status) || !Number.isFinite(toolCount)) throw new Error('运行记录无效')
      if (status === 'confirmed' && !runId) throw new Error('请先完成执行并核对本次运行记录')
      const item = get().data.companion.operations?.find(item => item.id === id)
      if (!item || item.revision !== revision || !item.enabled) return undefined
      const count = Math.min(8, Math.max(0, Math.round(toolCount)))
      const reason = status === 'confirmed' ? 'user_confirmed' : status === 'error' ? 'execution_failed' : status === 'cancelled' ? 'interrupted' : status === 'handoff' ? 'needs_user' : 'review'
      if (runId && !item.runs.some(run => run.id === runId && run.revision === revision && run.status === 'awaiting_review')) throw new Error('只能确认本次待核验的运行记录')
      const record: OperationRunRecord = { id: runId ?? `operation-run-${crypto.randomUUID()}`, revision, at: new Date().toISOString(), status, reason, toolCount: count }
      write((get().data.companion.operations ?? []).map(old => old.id === id ? { ...old, runs: [...old.runs.filter(run => run.id !== record.id), record].slice(-10) } : old))
      return record.id
    },
  }
}
