import { useMemo } from 'react'
import type { AssignmentOccurrence } from '../../../domain/assignments/types'
import { useLibraryStore } from '../../../state/useLibraryStore'
import { usePlanningClock } from './usePlanningClock'
import { assignmentDeadlineLabel, assignmentOverview } from './assignmentPresentation'
import './assignments.css'

export function AssignmentLink({ item, now }: { item: AssignmentOccurrence; now: Date }) {
  const open = useLibraryStore(state => state.openAgentDestination)
  return <button type="button" className={`today-assignment ${item.status}`} onClick={() => open({ destination: 'todos', section: 'assignments', targetId: item.assignment.id, date: item.originalDate })}><strong>{item.assignment.subject || item.assignment.title}</strong><small>{assignmentDeadlineLabel(item, now)}</small>{item.status === 'overdue' && <span>逾期未交</span>}</button>
}
export function UpcomingAssignments() {
  const assignments = useLibraryStore(state => state.data.planner.assignments)
  const now = usePlanningClock()
  const items = useMemo(() => { const overview = assignmentOverview(assignments ?? [], now); return [...overview.weekly, ...overview.once].sort((a, b) => a.deadline - b.deadline).slice(0, 3) }, [assignments, now])
  return items.length ? <div className="today-assignment-list"><h3>作业截止</h3>{items.map(item => <AssignmentLink key={`${item.assignment.id}:${item.key}`} item={item} now={now} />)}</div> : null
}
export function AssignmentCalendarMarker({ items }: { items: AssignmentOccurrence[] }) {
  if (!items.length) return null
  const pending = items.filter(item => item.status !== 'submitted' && item.status !== 'skipped').length
  return <i className="assignment-calendar-marker">{pending ? `${pending} 期作业` : '作业已处理'}</i>
}
export function AssignmentAgenda({ items, now }: { items: AssignmentOccurrence[]; now: Date }) {
  return items.length ? <section className="assignment-agenda"><h3>作业截止</h3>{items.map(item => <AssignmentLink key={`${item.assignment.id}:${item.key}`} item={item} now={now} />)}</section> : null
}
