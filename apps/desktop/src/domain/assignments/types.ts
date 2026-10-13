import type { CourseDay } from '../models'

export interface AssignmentRule {
  id: string
  repeat: 'once' | 'weekly'
  startDate: string
  endDate?: string
  weekdays: CourseDay[]
  time?: string
}
export interface AssignmentPeriod {
  date?: string
  time?: string | null
  submittedAt?: string
  skipped?: boolean
}
export interface Assignment {
  id: string
  title: string
  subject: string
  note: string
  rules: AssignmentRule[]
  periods: Record<string, AssignmentPeriod>
  createdAt: string
  deletedAt?: string
}
export interface AssignmentDraft {
  title: string
  subject: string
  note: string
  rule: Omit<AssignmentRule, 'id'>
}
export interface AssignmentOccurrence {
  assignment: Assignment
  key: string
  originalDate: string
  date: string
  time?: string
  submittedAt?: string
  skipped: boolean
  deadline: number
  status: 'submitted' | 'skipped' | 'overdue' | 'today' | 'upcoming'
}
