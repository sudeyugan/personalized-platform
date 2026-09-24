import { useEffect } from 'react'
import type { LibraryData } from '../../domain/models'
import { createComputerService } from '../../infrastructure/computerService'

const isTauri = () => '__TAURI_INTERNALS__' in window
const reminderKey = (kind: string, id: string, target: number, lead: number) => 'yiyu:reminder:' + kind + ':' + id + ':' + target + ':' + lead

function localTime(date: string, time = '09:00') {
  const parsed = new Date(date + 'T' + time + ':00')
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.getTime()
}

export function usePlannerNotifications(data: LibraryData) {
  useEffect(() => {
    const settings = data.companion.computer
    if (!isTauri() || !settings.enabled || !settings.backgroundReminders) return

    const service = createComputerService(settings)
    const check = () => {
      const now = Date.now()
      const lead = Math.max(0, settings.reminderLeadMinutes) * 60_000
      const candidates = [
        ...data.planner.calendarEvents.map((event) => ({
          kind: 'calendar',
          id: event.id,
          title: '日历事务即将开始',
          body: event.title + (event.time ? ' · ' + event.time : ''),
          target: localTime(event.date, event.time),
        })),
        ...data.planner.todos.filter((todo) => !todo.completed && todo.dueDate).map((todo) => ({
          kind: 'todo',
          id: todo.id,
          title: '待办即将到期',
          body: todo.title,
          target: localTime(todo.dueDate!),
        })),
      ]
      for (const item of candidates) {
        if (!item.target) continue
        const key = reminderKey(item.kind, item.id, item.target, settings.reminderLeadMinutes)
        if (window.localStorage.getItem(key)) continue
        if (now < item.target - lead || now > item.target + 5 * 60_000) continue
        window.localStorage.setItem(key, new Date().toISOString())
        void service.execute({ action: 'notify', params: { title: item.title, body: item.body } }, true)
          .catch(() => window.localStorage.removeItem(key))
      }
    }

    check()
    const timer = window.setInterval(check, 30_000)
    return () => window.clearInterval(timer)
  }, [data.companion.computer, data.planner.calendarEvents, data.planner.todos])
}