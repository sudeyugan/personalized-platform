import type { Assignment, AssignmentDraft, AssignmentPeriod, AssignmentRule } from './types'
import { assignmentScheduled, validAssignmentDate, validAssignmentTime } from './dates'

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const id = (value: unknown): value is string => typeof value === 'string' && /^[\w-]{1,100}$/.test(value)
const text = (value: unknown) => typeof value === 'string' ? value : ''
export function assignmentRule(value: unknown): AssignmentRule | undefined {
  if (!record(value) || !id(value.id) || !validAssignmentDate(value.startDate) || !['once', 'weekly'].includes(String(value.repeat))) return undefined
  const weekdays = [...new Set(Array.isArray(value.weekdays) ? value.weekdays.filter((day): day is 1 | 2 | 3 | 4 | 5 | 6 | 7 => Number.isInteger(day) && day >= 1 && day <= 7) : [])].sort()
  if (value.repeat === 'weekly' && !weekdays.length) return undefined
  if (value.endDate !== undefined && (!validAssignmentDate(value.endDate) || value.endDate < value.startDate)) return undefined
  if (value.time !== undefined && value.time !== '' && !validAssignmentTime(value.time)) return undefined
  return { id: value.id, repeat: value.repeat as AssignmentRule['repeat'], startDate: value.startDate, endDate: value.endDate as string | undefined, weekdays, time: value.time ? String(value.time) : undefined }
}
export function validateAssignmentDraft(draft: AssignmentDraft) {
  if (!draft.title.trim()) throw new Error('请填写作业名称')
  if (!assignmentRule({ ...draft.rule, id: 'validation' })) throw new Error('请检查截止日期、星期、时间和起止范围')
}
export function normalizeAssignments(value: unknown): Assignment[] {
  if (!Array.isArray(value)) return []
  const result = new Map<string, Assignment>()
  for (const item of value) {
    if (!record(item) || !id(item.id) || !text(item.title).trim()) continue
    const rules = [...new Map((Array.isArray(item.rules) ? item.rules : []).flatMap(value => { const rule = assignmentRule(value); return rule ? [[rule.id, rule] as const] : [] })).values()]
    if (!rules.length) continue
    const periods: Record<string, AssignmentPeriod> = {}
    for (const [key, entry] of Object.entries(record(item.periods) ? item.periods : {})) {
      const [ruleId, date] = key.split('@')
      if (key.split('@').length !== 2 || !rules.some(rule => rule.id === ruleId && assignmentScheduled(rule, date, true)) || !record(entry)) continue
      if (entry.date !== undefined && !validAssignmentDate(entry.date)) continue
      if (entry.time !== undefined && entry.time !== null && !validAssignmentTime(entry.time)) continue
      const submittedAt = typeof entry.submittedAt === 'string' && !Number.isNaN(Date.parse(entry.submittedAt)) ? entry.submittedAt : undefined
      periods[key] = { date: entry.date as string | undefined, time: entry.time as string | null | undefined, submittedAt, skipped: !submittedAt && entry.skipped === true }
    }
    result.set(item.id, { id: item.id, title: text(item.title), subject: text(item.subject), note: text(item.note), rules, periods, createdAt: text(item.createdAt), deletedAt: typeof item.deletedAt === 'string' ? item.deletedAt : undefined })
  }
  return [...result.values()]
}
