import { useMemo, useState } from 'react'
import { BookOpen, Plus, ArchiveRestore } from 'lucide-react'
import type { Assignment, AssignmentOccurrence } from '../../../domain/assignments/types'
import { useLibraryStore } from '../../../state/useLibraryStore'
import { useNavigationTarget } from '../../search/useNavigationTarget'
import { AssignmentForm } from './AssignmentForm'
import { AssignmentCard } from './AssignmentCard'
import { assignmentOverview } from './assignmentPresentation'
import { usePlanningClock } from './usePlanningClock'
import './assignments.css'

export function AssignmentsPanel() {
  const assignments = useLibraryStore(state => state.data.planner.assignments)
  const trash = useLibraryStore(state => state.trashAssignment)
  const now = usePlanningClock()
  const targetId = useNavigationTarget('todos')
  const targetDate = useLibraryStore(state => state.data.session.agentNavigation?.destination === 'todos' ? state.data.session.agentNavigation.date : undefined)
  const [editing, setEditing] = useState<{ assignment?: Assignment; periodKey?: string }>()
  const [visible, setVisible] = useState(20)
  const overview = useMemo(() => assignmentOverview(assignments ?? [], now, targetDate), [assignments, now, targetDate])
  const live = (assignments ?? []).filter(item => !item.deletedAt)
  const removed = (assignments ?? []).filter(item => item.deletedAt)
  const targeted = (item: AssignmentOccurrence) => targetId === item.assignment.id && (!targetDate || item.originalDate === targetDate)
  const renderCard = (item: AssignmentOccurrence) => <AssignmentCard key={item.assignment.id + ':' + item.key} occurrence={item} onEdit={(assignment, periodKey) => setEditing({ assignment, periodKey })} targeted={targeted(item)} />
  const focused = targetDate ? overview.occurrences.find(item => targeted(item) && !overview.weekly.includes(item) && !overview.once.includes(item)) : undefined
  const missingTarget = targetId && !focused && ![...overview.weekly, ...overview.once].some(item => targeted(item)) ? live.find(item => item.id === targetId) : undefined
  return <section className="assignments-panel" aria-label="作业截止">
    <header className="assignment-panel-heading"><button className="primary-button" type="button" onClick={() => setEditing({})}><Plus size={15} />添加作业</button></header>
    {editing && <AssignmentForm key={(editing.assignment?.id ?? 'new') + ':' + (editing.periodKey ?? '')} assignment={editing.assignment} periodKey={editing.periodKey} onClose={() => setEditing(undefined)} />}
    {!live.length && !editing && <div className="assignment-empty"><BookOpen size={29} strokeWidth={1.2} /><h3>还没有记下作业</h3><p>哪门课，周几交。记下来就好。</p><button type="button" onClick={() => setEditing({})}>添加第一门课</button></div>}
    {live.length > 0 && <>
      <section className="assignment-group" aria-label="本周作业"><header><h3>本周作业</h3><span>{overview.week.from.slice(5).replace('-', '/')} — {overview.week.to.slice(5).replace('-', '/')}</span></header><div>{overview.weekly.map(renderCard)}</div>{!overview.weekly.length && <p className="assignment-quiet">本周没有待交作业。</p>}</section>
      <section className="assignment-group" aria-label="单次截止"><header><h3>单次截止</h3></header><div>{overview.once.map(renderCard)}</div>{!overview.once.length && <p className="assignment-quiet">没有单次作业。</p>}</section>
    </>}
    {focused && <section className="assignment-group" aria-label="定位的记录"><header><h3>定位的记录</h3></header>{renderCard(focused)}</section>}
    {missingTarget && <button type="button" className="assignment-more" onClick={() => setEditing({ assignment: missingTarget })}>打开作业设置：{missingTarget.subject || missingTarget.title}</button>}
    {overview.history.length > 0 && <details className="assignment-history"><summary>已交与往期记录</summary>{overview.history.filter((item, index) => index < visible || targeted(item)).filter(item => item !== focused).map(renderCard)}{overview.history.length > visible && <button type="button" className="assignment-more" onClick={() => setVisible(count => count + 20)}>查看更多记录</button>}</details>}
    {removed.length > 0 && <details className="assignment-history"><summary>收起的课程</summary>{removed.map(item => <div className="assignment-archived" key={item.id}><span>{item.subject || item.title}</span><button type="button" onClick={() => trash(item.id, false)}><ArchiveRestore size={13} />恢复</button></div>)}</details>}
  </section>
}
