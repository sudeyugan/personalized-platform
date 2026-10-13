import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import type { Assignment, AssignmentDraft } from '../../../domain/assignments/types'
import type { CourseDay } from '../../../domain/models'
import { assignmentOccurrence, assignmentRuleChangeStart } from '../../../domain/assignments/dates'
import { validateAssignmentDraft } from '../../../domain/assignments/normalization'
import { formatLocalDate } from '../../../domain/localDate'
import { useLibraryStore } from '../../../state/useLibraryStore'
import { assignmentWeek } from './assignmentPresentation'
import { TodoWeekdayPicker } from '../TodoWeekdayPicker'

export function AssignmentForm({ assignment, periodKey, onClose }: { assignment?: Assignment; periodKey?: string; onClose: () => void }) {
  const saveAssignment = useLibraryStore(state => state.saveAssignment)
  const setPeriod = useLibraryStore(state => state.setAssignmentPeriod)
  const courses = useLibraryStore(state => state.data.planner.courses)
  const latest = assignment?.rules.at(-1)
  const selected = assignment && periodKey ? assignmentOccurrence(assignment, periodKey) : undefined
  const selectedRule = selected && assignment?.rules.find(item => item.id === selected.key.split('@')[0])
  const rule = selectedRule?.repeat === 'once' ? selectedRule : latest
  const onceKey = rule?.repeat === 'once' ? (selectedRule?.repeat === 'once' ? selected?.key : undefined) ?? rule.id + '@' + rule.startDate : undefined
  const once = assignment && onceKey ? assignmentOccurrence(assignment, onceKey) : undefined
  const [draft, setDraft] = useState<AssignmentDraft>(() => ({ title: assignment?.title ?? '', subject: assignment?.subject || assignment?.title || '', note: assignment?.note ?? '', rule: rule ? { ...rule, startDate: once?.date ?? rule.startDate, time: once ? once.time : rule.time } : { repeat: 'weekly', startDate: assignmentWeek().from, weekdays: [(new Date().getDay() || 7) as CourseDay] } }))
  const [error, setError] = useState('')
  const minStart = assignment ? assignmentRuleChangeStart(assignment) : '2000-01-01'
  const setRule = (changes: Partial<AssignmentDraft['rule']>) => setDraft(old => ({ ...old, rule: { ...old.rule, ...(assignment && old.rule.repeat === 'weekly' && old.rule.startDate < minStart ? { startDate: minStart } : {}), ...changes } }))
  const ruleChanged = Boolean(assignment && rule?.repeat === 'weekly' && (draft.rule.startDate !== rule.startDate || draft.rule.endDate !== rule.endDate || draft.rule.time !== rule.time || draft.rule.weekdays.join(',') !== rule.weekdays.join(',')))
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const value = { ...draft, title: draft.title.trim() || draft.subject.trim() }
    try {
      if (!value.subject.trim()) throw new Error('请填写课程')
      validateAssignmentDraft(value)
      if (assignment && onceKey && !once) throw new Error('找不到这期作业，请重新打开')
      saveAssignment(value, assignment?.id, ruleChanged)
      if (assignment && once && (once.date !== value.rule.startDate || once.time !== value.rule.time)) setPeriod(assignment.id, once.key, { date: value.rule.startDate, time: value.rule.time ?? null })
      onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '暂时无法保存') }
  }
  return <form className="assignment-form" onSubmit={submit} aria-label={assignment ? '编辑作业' : '新增作业'}>
    <header><h3>{assignment ? '编辑作业' : '添加作业'}</h3><button type="button" onClick={onClose} aria-label="关闭作业编辑"><X size={17} /></button></header>
    {!assignment && <div className="assignment-kind" aria-label="作业类型">{(['weekly', 'once'] as const).map(repeat => <button type="button" key={repeat} aria-pressed={draft.rule.repeat === repeat} onClick={() => setRule({ repeat, startDate: repeat === 'weekly' ? assignmentWeek().from : formatLocalDate(), endDate: undefined })}>{repeat === 'weekly' ? '每周作业' : '单次作业'}</button>)}</div>}
    <div className="assignment-form-grid assignment-essential">
      <label>哪门课<input autoFocus required maxLength={100} list="assignment-subjects" value={draft.subject} onChange={event => setDraft({ ...draft, subject: event.target.value, title: draft.title === draft.subject ? event.target.value : draft.title })} placeholder="选择课程，或直接填写" /><datalist id="assignment-subjects">{[...new Set(courses.map(course => course.title))].map(title => <option key={title} value={title} />)}</datalist></label>
      {draft.rule.repeat === 'weekly' ? draft.rule.weekdays.length > 1 ? <div className="assignment-weekdays"><span>周几交</span><TodoWeekdayPicker value={draft.rule.weekdays} onChange={weekdays => setRule({ weekdays })} /></div> : <label>周几交<select value={draft.rule.weekdays[0] ?? 1} onChange={event => setRule({ weekdays: [Number(event.target.value) as CourseDay] })}>{['一', '二', '三', '四', '五', '六', '日'].map((day, index) => <option value={index + 1} key={day}>周{day}</option>)}</select></label> : <label>截止日期<input required type="date" min="2000-01-01" max="2199-12-31" value={draft.rule.startDate} onChange={event => setRule({ startDate: event.target.value })} /></label>}
    </div>
    {ruleChanged && <p className="assignment-form-hint">调整从 {draft.rule.startDate} 起生效，之前的记录保留。</p>}
    <details className="assignment-extra"><summary>更多设置 · 可选</summary><div className="assignment-form-grid">
      <label className="assignment-wide">作业名称 · 可选<input maxLength={200} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder="不填就使用课程名" /></label>
      <label>截止时间 · 可选<input type="time" value={draft.rule.time ?? ''} onChange={event => setRule({ time: event.target.value || undefined })} /></label>
      {draft.rule.repeat === 'weekly' && <><label>开始日期<input type="date" min={assignment && ruleChanged ? minStart : '2000-01-01'} max="2199-12-31" value={draft.rule.startDate} onChange={event => setRule({ startDate: event.target.value })} /></label><label>结束日期 · 可选<input type="date" min={draft.rule.startDate} max="2199-12-31" value={draft.rule.endDate ?? ''} onChange={event => setRule({ endDate: event.target.value || undefined })} /></label></>}
      <label className="assignment-wide">备注 · 可选<textarea rows={2} value={draft.note} onChange={event => setDraft({ ...draft, note: event.target.value })} /></label>
      <p className="assignment-wide assignment-form-hint">不填时间，按当天结束截止。</p>
    </div></details>
    {error && <p role="alert">{error}</p>}
    <footer><button type="button" onClick={onClose}>取消</button><button className="primary-button" type="submit">{assignment ? '保存' : '添加'}</button></footer>
  </form>
}
