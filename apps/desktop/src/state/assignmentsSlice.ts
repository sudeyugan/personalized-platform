import type { Assignment, AssignmentDraft, AssignmentPeriod } from '../domain/assignments/types'
import { assignmentOccurrence, assignmentRuleChangeStart, shiftAssignmentDate, validAssignmentDate, validAssignmentTime } from '../domain/assignments/dates'
import { validateAssignmentDraft } from '../domain/assignments/normalization'
import type { LibraryStore } from './libraryStoreTypes'
import { commitLibraryData, type LibraryStoreSetter } from './persistence'

export interface AssignmentsActions {
  saveAssignment: (draft: AssignmentDraft, id?: string, replaceRule?: boolean) => string
  setAssignmentPeriod: (id: string, key: string, changes: AssignmentPeriod) => void
  removeAssignmentPeriod: (id: string, key: string) => void
  trashAssignment: (id: string, trashed: boolean) => void
}
const makeId = () => `assignment-${crypto.randomUUID()}`
export function createAssignmentsSlice(get: () => LibraryStore, set: LibraryStoreSetter): AssignmentsActions {
  const commit = (assignments: Assignment[]) => {
    const data = get().data
    commitLibraryData({ ...data, planner: { ...data.planner, assignments } }, set)
  }
  return {
    saveAssignment: (draft, id, replaceRule = false) => {
      validateAssignmentDraft(draft)
      const assignments = get().data.planner.assignments ?? []
      const existing = id ? assignments.find(item => item.id === id && !item.deletedAt) : undefined
      if (id && !existing) throw new Error('找不到这份作业')
      const rule = { ...draft.rule, id: makeId() }
      let rules = existing?.rules ?? [rule]
      if (existing && replaceRule) {
        if (rule.startDate < assignmentRuleChangeStart(existing)) throw new Error('新规则不能覆盖旧记录；请选择更晚的开始日期，本期可以单独改期')
        rules = existing.rules.map(old => old.startDate < rule.startDate && (!old.endDate || old.endDate >= rule.startDate) ? { ...old, endDate: shiftAssignmentDate(rule.startDate, -1) } : old)
        if (rules.some(old => old.startDate >= rule.startDate)) throw new Error('已有之后生效的规则，请从更晚日期调整')
        rules = [...rules, rule]
      }
      const saved: Assignment = { id: existing?.id ?? makeId(), title: draft.title.trim(), subject: draft.subject.trim(), note: draft.note.trim(), rules, periods: existing?.periods ?? {}, createdAt: existing?.createdAt ?? new Date().toISOString() }
      commit(existing ? assignments.map(item => item.id === saved.id ? saved : item) : [saved, ...assignments])
      return saved.id
    },
    setAssignmentPeriod: (id, key, changes) => {
      if (changes.date !== undefined && !validAssignmentDate(changes.date)) throw new Error('请填写有效的本期截止日期')
      if (changes.time !== undefined && changes.time !== null && !validAssignmentTime(changes.time)) throw new Error('请填写有效的本期截止时间')
      if (changes.submittedAt && Number.isNaN(Date.parse(changes.submittedAt))) throw new Error('提交时间无效')
      const assignments = get().data.planner.assignments ?? []
      const assignment = assignments.find(item => item.id === id)
      if (!assignment || !assignmentOccurrence(assignment, key)) throw new Error('找不到这期作业')
      const periods = { ...assignment.periods, [key]: { ...assignment.periods[key], ...changes } }
      const candidate = { ...assignment, periods }
      const occurrence = assignmentOccurrence(candidate, key)
      if (!occurrence || !Number.isFinite(occurrence.deadline)) throw new Error('请检查本期截止日期和时间')
      if (occurrence.skipped && occurrence.submittedAt) throw new Error('已交作业不能同时停交，请先撤销提交')
      commit(assignments.map(item => item.id === id ? candidate : item))
    },
    removeAssignmentPeriod: (id, key) => {
      const assignments = get().data.planner.assignments ?? []
      commit(assignments.map(item => { if (item.id !== id) return item; const periods = { ...item.periods }; delete periods[key]; return { ...item, periods } }))
    },
    trashAssignment: (id, trashed) => {
      const assignments = get().data.planner.assignments ?? []
      commit(assignments.map(item => item.id === id ? { ...item, deletedAt: trashed ? new Date().toISOString() : undefined } : item))
    },
  }
}
