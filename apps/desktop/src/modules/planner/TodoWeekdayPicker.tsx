import type { CourseDay } from '../../domain/models'
import { scheduleShortDays } from './scheduleConstants'

export function TodoWeekdayPicker({ value, onChange }: { value: CourseDay[]; onChange: (days: CourseDay[]) => void }) {
  const toggle = (day: CourseDay) => onChange(value.includes(day) ? value.filter((item) => item !== day) : [...value, day].sort())

  return (
    <div className="weekday-picker" aria-label="每周重复日期">
      {scheduleShortDays.map((label, index) => {
        const day = (index + 1) as CourseDay
        return <button type="button" className={value.includes(day) ? 'active' : ''} key={day} onClick={() => toggle(day)}>周{label}</button>
      })}
    </div>
  )
}
