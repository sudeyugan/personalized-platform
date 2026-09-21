import { Plus, Target } from 'lucide-react'
import type { TodoItem, TodoQuotaPeriod } from '../../domain/models'
import { quotaTodoProgress } from './plannerDates'

const periodLabels: Record<TodoQuotaPeriod, string> = {
  day: '每天',
  week: '每周',
  month: '每月',
}

export function TodoQuotaSettings({ period, target, onChange }: {
  period: TodoQuotaPeriod
  target: number
  onChange: (changes: { quotaPeriod?: TodoQuotaPeriod; quotaTarget?: number }) => void
}) {
  return (
    <div className="todo-quota-settings">
      <Target size={14} />
      <select aria-label="次数任务周期" value={period} onChange={(event) => onChange({ quotaPeriod: event.target.value as TodoQuotaPeriod })}>
        {Object.entries(periodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <span>完成</span>
      <input aria-label="周期目标次数" type="number" min="1" max="99" value={target} onChange={(event) => onChange({ quotaTarget: Math.min(99, Math.max(1, Number(event.target.value) || 1)) })} />
      <span>次</span>
    </div>
  )
}

export function TodoQuotaProgress({ todo, date, onAdd, disabled = false }: {
  todo: TodoItem
  date: string
  onAdd: () => void
  disabled?: boolean
}) {
  const progress = quotaTodoProgress(todo, date)
  const visibleMarkCount = Math.min(Math.max(progress.target, progress.count), 8)

  return (
    <div className={progress.reached ? 'todo-quota-compact reached' : 'todo-quota-compact'}>
      <div className="todo-quota-marks" aria-label={`${progress.periodLabel}已完成 ${progress.count} 次，目标 ${progress.target} 次`}>
        {Array.from({ length: visibleMarkCount }, (_, index) => <i className={index < progress.count ? 'filled' : ''} key={index} />)}
        {Math.max(progress.count, progress.target) > 8 && <b>共 {progress.count}/{progress.target}</b>}
      </div>
      <span><strong>{progress.periodLabel} {progress.count} / {progress.target}</strong>{progress.reached ? progress.overage ? ` · 超额 ${progress.overage} 次` : ' · 已完成' : ` · 还差 ${progress.target - progress.count} 次`}</span>
      <button type="button" disabled={disabled} onClick={onAdd}><Plus size={13} />{disabled ? '今日休假' : '记录一次'}</button>
    </div>
  )
}
