import { CalendarClock, Minus, Repeat2, Settings2, Trash2, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { TodoItem } from '../../domain/models'
import { dayNumber, quotaTodoProgress } from './plannerDates'
import { TodoQuotaSettings } from './TodoQuotaControls'
import { TodoWeekdayPicker } from './TodoWeekdayPicker'

type RepeatMode = 'none' | 'daily' | 'weekly' | 'quota'

const repeatLabel: Record<RepeatMode, string> = {
  none: '不重复',
  daily: '每日',
  weekly: '每周指定日期',
  quota: '周期次数',
}

const priorityLabel = { low: '低', medium: '普通', high: '重要' } as const

export function TodoSettingsDialog({ todo, today, onClose, onUpdate, onChangeRepeat, onRemoveCompletion, onDelete }: {
  todo: TodoItem
  today: string
  onClose: () => void
  onUpdate: (changes: Partial<TodoItem>) => void
  onChangeRepeat: (next: RepeatMode) => void
  onRemoveCompletion: (completionId: string) => void
  onDelete: () => void
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const mode: RepeatMode = todo.repeat === 'daily' ? 'daily' : todo.repeat === 'weekly' || todo.repeat === 'weekdays' ? 'weekly' : todo.repeat === 'quota' ? 'quota' : 'none'
  const quota = mode === 'quota' ? quotaTodoProgress(todo, today) : undefined
  const latest = quota?.completions.at(-1)

  useEffect(() => {
    closeButtonRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <div className="confirm-dialog-backdrop todo-settings-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="todo-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="todo-settings-title">
        <header>
          <div className="todo-settings-heading">
            <span><Settings2 size={17} /></span>
            <div><small>待办设置</small><h2 id="todo-settings-title">{todo.title}</h2></div>
          </div>
          <button ref={closeButtonRef} className="todo-settings-close" type="button" aria-label="关闭设置" onClick={onClose}><X size={17} /></button>
        </header>

        <div className="todo-settings-body">
          <label className="todo-setting-row">
            <span><Repeat2 size={14} />重复方式</span>
            <select value={mode} onChange={(event) => onChangeRepeat(event.target.value as RepeatMode)}>
              {Object.entries(repeatLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label>

          {mode === 'none' && <label className="todo-setting-row"><span><CalendarClock size={14} />执行日期</span><input type="date" value={todo.dueDate ?? today} onChange={(event) => onUpdate({ dueDate: event.target.value || undefined })} /></label>}
          {mode === 'daily' && <p className="todo-setting-hint">每天出现，不需要单独选择日期。</p>}
          {mode === 'weekly' && <div className="todo-setting-block"><span>每周出现于</span><TodoWeekdayPicker value={todo.repeatDays ?? [dayNumber(todo.dueDate ?? today)]} onChange={(days) => onUpdate({ repeatDays: days.length ? days : [dayNumber(today)], completedDates: [] })} /></div>}
          {mode === 'quota' && <div className="todo-setting-block"><span>周期目标</span><TodoQuotaSettings period={todo.quotaPeriod ?? 'week'} target={todo.quotaTarget ?? 3} onChange={onUpdate} /></div>}

          <label className="todo-setting-row">
            <span>重要程度</span>
            <select value={todo.priority} onChange={(event) => onUpdate({ priority: event.target.value as TodoItem['priority'] })}>
              {Object.entries(priorityLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label>

          {quota && <div className="todo-setting-history">
            <div><span>本周期记录</span><strong>{quota.count} / {quota.target}</strong></div>
            <small>累计记录 {quota.total} 次 · {quota.reached ? quota.overage ? `已达成，超额 ${quota.overage} 次` : '本周期已达成' : `还差 ${quota.target - quota.count} 次`}</small>
            <button type="button" disabled={!latest} onClick={() => latest && onRemoveCompletion(latest.id)}><Minus size={14} />撤销最近一次记录</button>
          </div>}
        </div>

        <footer>
          <button className="todo-settings-delete" type="button" onClick={onDelete}><Trash2 size={14} />删除待办</button>
          <button className="primary-button" type="button" onClick={onClose}>完成</button>
        </footer>
      </section>
    </div>
  )
}
