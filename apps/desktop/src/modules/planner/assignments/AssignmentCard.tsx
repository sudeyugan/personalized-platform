import { useEffect, useState } from 'react'
import { Check, RotateCcw, MoreHorizontal } from 'lucide-react'
import type { Assignment, AssignmentOccurrence } from '../../../domain/assignments/types'
import { assignmentDeadlineLabel } from './assignmentPresentation'
import { useLibraryStore } from '../../../state/useLibraryStore'

export function AssignmentCard({ occurrence, onEdit, targeted }: { occurrence: AssignmentOccurrence; onEdit: (assignment: Assignment, periodKey: string) => void; targeted: boolean }) {
  const { assignment, key } = occurrence
  const setPeriod = useLibraryStore(state => state.setAssignmentPeriod)
  const removePeriod = useLibraryStore(state => state.removeAssignmentPeriod)
  const trash = useLibraryStore(state => state.trashAssignment)
  const [date, setDate] = useState(occurrence.date)
  const [time, setTime] = useState(occurrence.time ?? '')
  useEffect(() => { setDate(occurrence.date); setTime(occurrence.time ?? '') }, [occurrence.date, occurrence.time])
  const [error, setError] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(false)
  const act = (action: () => void) => { try { action(); setError('') } catch (reason) { setError(reason instanceof Error ? reason.message : '操作失败') } }
  const complete = Boolean(occurrence.submittedAt)
  return <article className={`assignment-card assignment-${occurrence.status}${targeted ? ' assignment-targeted' : ''}`} data-navigation-target={targeted ? assignment.id : undefined}>
    <div className="assignment-card-body"><h3>{assignment.subject || assignment.title}</h3>{assignment.subject && assignment.title !== assignment.subject && <p className="assignment-card-subtitle">{assignment.title}</p>}<p className="assignment-deadline">{assignmentDeadlineLabel(occurrence)}</p>{occurrence.status === 'overdue' && <span className="assignment-state">逾期未交</span>}{complete && <span className="assignment-state">已交</span>}{occurrence.skipped && <span className="assignment-state">本期停交</span>}{occurrence.date !== occurrence.originalDate && <small className="assignment-original-date">原定 {occurrence.originalDate}</small>}</div>
    <div className="assignment-card-actions"><button type="button" className="assignment-submit" disabled={occurrence.skipped} aria-label={`${complete ? '撤销已交' : '标记已交'} ${assignment.title} ${occurrence.originalDate}`} onClick={() => act(() => setPeriod(assignment.id, key, { submittedAt: complete ? undefined : new Date().toISOString() }))}>{complete ? <RotateCcw size={14} /> : <Check size={15} />}{complete ? '撤销已交' : '标记已交'}</button><details className="assignment-period-settings"><summary aria-label={`本期设置 ${assignment.title} ${occurrence.originalDate}`}><MoreHorizontal size={16} /><span>本期设置</span></summary><div>
      {assignment.note && <p className="assignment-note">{assignment.note}</p>}<p>本期：{occurrence.originalDate}</p>{complete && <p>已交于 {new Date(occurrence.submittedAt!).toLocaleString('zh-CN')}</p>}<label>本期截止日期<input type="date" min="2000-01-01" max="2199-12-31" value={date} onChange={event => setDate(event.target.value)} /></label><label>本期截止时间<input type="time" value={time} onChange={event => setTime(event.target.value)} /></label><button type="button" onClick={() => act(() => setPeriod(assignment.id, key, { date, time: time || null }))}>应用本期改期</button><button type="button" disabled={complete} onClick={() => act(() => setPeriod(assignment.id, key, { skipped: !occurrence.skipped }))}>{occurrence.skipped ? '恢复本期交付' : '本期不需要交'}</button>{assignment.periods[key] && <button type="button" onClick={() => act(() => { removePeriod(assignment.id, key); setDate(occurrence.originalDate); setTime(assignment.rules.find(rule => key.startsWith(`${rule.id}@`))?.time ?? '') })}>重置本期（含撤销已交）</button>}<button type="button" onClick={() => onEdit(assignment, key)}>编辑课程与截止</button><button type="button" onClick={() => setConfirmRemove(true)}>收起整份作业</button>{confirmRemove && <div className="assignment-remove-confirm"><p>收起后可从「收起的课程」恢复。</p><button type="button" onClick={() => act(() => trash(assignment.id, true))}>确认收起</button><button type="button" onClick={() => setConfirmRemove(false)}>取消</button></div>}
    </div></details></div>{error && <p className="assignment-card-error" role="alert">{error}</p>}
  </article>
}
