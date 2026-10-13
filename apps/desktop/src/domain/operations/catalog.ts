import type { LearnedOperation, OperationDraft, OperationRunRecord } from './types'
import { validateOperationDraft } from './method'
import { validOperationPattern } from './learning'

const draftKeys = ['title', 'goal', 'scope', 'applicability', 'keywords', 'preconditions', 'steps', 'completion', 'recovery'] as const
export function normalizeOperations(value: unknown): LearnedOperation[] {
  if (!Array.isArray(value)) return []
  const ids = new Set<string>()
  return value.slice(0, 100).flatMap(item => {
    try {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !/^operation-[\w-]{1,80}$/u.test(item.id) || ids.has(item.id) || !Number.isSafeInteger(item.revision) || item.revision < 1 || ![item.createdAt, item.updatedAt].every(date => typeof date === 'string' && Number.isFinite(Date.parse(date)))) return []
      const draft = validateOperationDraft(Object.fromEntries(draftKeys.map(key => [key, item[key]])))
      ids.add(item.id)
      const runs: OperationRunRecord[] = Array.isArray(item.runs) ? item.runs.slice(-10).flatMap((run: OperationRunRecord) => {
        if (!run || typeof run.id !== 'string' || !/^operation-run-[\w-]{1,80}$/u.test(run.id) || !Number.isSafeInteger(run.revision) || run.revision < 1 || typeof run.at !== 'string' || !Number.isFinite(Date.parse(run.at)) || !['awaiting_review', 'confirmed', 'handoff', 'error', 'cancelled'].includes(run.status) || !['review', 'user_confirmed', 'execution_failed', 'interrupted', 'needs_user'].includes(run.reason) || !Number.isInteger(run.toolCount) || run.toolCount < 0 || run.toolCount > 8) return []
        return [{ id: run.id, revision: run.revision, at: run.at, status: run.status, reason: run.reason, toolCount: run.toolCount }]
      }) : []
      return [{ ...draft, id: item.id, revision: item.revision, enabled: item.enabled === true, createdAt: item.createdAt, updatedAt: item.updatedAt, runs, ...(validOperationPattern(item.pattern) ? { pattern: item.pattern, source: item.source === 'automatic' ? 'automatic' as const : 'manual' as const } : {}) }]
    } catch { return [] }
  })
}
function normalized(text: string) { return text.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu, '') }
function grams(text: string) { const value = normalized(text); return new Set(Array.from({ length: Math.max(0, value.length - 1) }, (_, index) => value.slice(index, index + 2))) }
export function matchOperations(operations: LearnedOperation[], query: string) {
  const needle = normalized(query.slice(0, 2000))
  if (needle.length < 2) return []
  const queryGrams = grams(needle)
  return operations.filter(item => item.enabled).map(item => {
    const aliases = [item.title, ...item.keywords].map(normalized).filter(word => word.length >= 2)
    const direct = aliases.some(alias => needle.includes(alias))
    const overlap = Math.max(0, ...aliases.map(alias => { const words = grams(alias); return [...words].filter(word => queryGrams.has(word)).length / Math.max(words.size, queryGrams.size, 1) }))
    return { item, score: direct ? 1 : overlap }
  }).filter(({ score }) => score >= 0.35).sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title)).slice(0, 5).map(({ item }) => ({ id: item.id, revision: item.revision, title: item.title, scope: item.scope }))
}
export function operationDraftOf(operation: LearnedOperation): OperationDraft { return Object.fromEntries(draftKeys.map(key => [key, operation[key]])) as unknown as OperationDraft }
