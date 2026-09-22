import type { CalendarEvent, Course, DiaryEntry, LibraryData, TodoItem } from '../domain/models'
import { libraryRepository } from '../infrastructure/libraryRepository'
import type { LibraryStore } from './libraryStoreTypes'

type SetStore = (partial: Partial<LibraryStore>) => void
const makeId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`
const commit = (data: LibraryData, set: SetStore) => { set({ data }); void libraryRepository.save(data) }

type PlannerActions = 'saveDiaryEntry' | 'openDiary' | 'saveDailyQuestion' | 'startDailyQuestionDiary' | 'saveMoodEntry' | 'deleteMoodEntry' | 'addCourse' | 'updateCourse' | 'deleteCourse' | 'addCalendarEvent' | 'updateCalendarEvent' | 'deleteCalendarEvent' | 'addTodo' | 'updateTodo' | 'toggleTodoForDate' | 'toggleTodoHoliday' | 'recordTodoCompletion' | 'removeTodoCompletion' | 'deleteTodo'

export function createPlannerSlice(get: () => LibraryStore, set: SetStore): Pick<LibraryStore, PlannerActions> {
  const updatePlanner = (planner: LibraryData['planner']) => commit({ ...get().data, planner }, set)
  return {
    openDiary: (date) => {
      const current = get().data
      commit({ ...current, session: { ...current.session, activeView: 'diary', activeDiaryDate: date } }, set)
    },
    saveDiaryEntry: (entry: DiaryEntry) => {
      const planner = get().data.planner
      const exists = planner.diaryEntries.some((item) => item.date === entry.date)
      updatePlanner({ ...planner, diaryEntries: exists ? planner.diaryEntries.map((item) => item.date === entry.date ? entry : item) : [...planner.diaryEntries, entry] })
    },
    saveDailyQuestion: (question) => {
      const planner = get().data.planner
      const withoutDate = (planner.dailyQuestions ?? []).filter((item) => item.date !== question.date)
      updatePlanner({ ...planner, dailyQuestions: [...withoutDate, question].sort((a, b) => a.date.localeCompare(b.date)).slice(-90) })
    },
    startDailyQuestionDiary: (question) => {
      const current = get().data
      const planner = current.planner
      const existing = planner.diaryEntries.find((item) => item.date === question.date)
      const marker = `【朝问 · ${question.date}】`
      const prompt = `${marker}\n${question.question}\n\n${question.background}\n\n再往深处想：${question.followUp}\n\n我的想法：\n`
      const entry: DiaryEntry = existing
        ? { ...existing, content: existing.content.includes(marker) ? existing.content : `${existing.content.trim()}\n\n${prompt}`.trim(), updatedAt: new Date().toISOString() }
        : { date: question.date, title: `朝问 · ${question.date.slice(5).replace('-', '月')}日`, content: prompt, updatedAt: new Date().toISOString() }
      const diaryEntries = existing ? planner.diaryEntries.map((item) => item.date === question.date ? entry : item) : [...planner.diaryEntries, entry]
      commit({ ...current, planner: { ...planner, diaryEntries }, session: { ...current.session, activeView: 'diary', activeDiaryDate: question.date } }, set)
    },
    saveMoodEntry: (entry) => {
      const planner = get().data.planner
      if (Object.values(entry.points).reduce((sum, count) => sum + (count ?? 0), 0) !== 5) return
      const note = entry.note?.trim()
      const existing = planner.moodEntries.find((item) => item.date === entry.date && item.period === entry.period)
      const now = new Date().toISOString()
      const saved = { ...entry, note: note || undefined, id: existing?.id ?? makeId('mood'), createdAt: existing?.createdAt ?? now, updatedAt: now }
      updatePlanner({ ...planner, moodEntries: existing ? planner.moodEntries.map((item) => item.id === existing.id ? saved : item) : [...planner.moodEntries, saved] })
    },
    deleteMoodEntry: (id) => {
      const planner = get().data.planner
      updatePlanner({ ...planner, moodEntries: planner.moodEntries.filter((entry) => entry.id !== id) })
    },
    addCourse: (course: Omit<Course, 'id'>) => {
      const planner = get().data.planner
      updatePlanner({ ...planner, courses: [...planner.courses, { ...course, id: makeId('course') }] })
    },
    updateCourse: (id, changes) => {
      const planner = get().data.planner
      updatePlanner({ ...planner, courses: planner.courses.map((course) => course.id === id ? { ...course, ...changes } : course) })
    },
    deleteCourse: (id) => {
      const planner = get().data.planner
      updatePlanner({ ...planner, courses: planner.courses.filter((course) => course.id !== id) })
    },
    addCalendarEvent: (event: Omit<CalendarEvent, 'id'>) => {
      const clean = event.title.trim()
      if (!clean) return
      const planner = get().data.planner
      updatePlanner({ ...planner, calendarEvents: [...planner.calendarEvents, { ...event, title: clean, id: makeId('calendar-event') }] })
    },
    updateCalendarEvent: (id, changes) => {
      const planner = get().data.planner
      const cleanTitle = changes.title?.trim()
      updatePlanner({ ...planner, calendarEvents: planner.calendarEvents.map((event) => event.id === id ? { ...event, ...changes, ...(cleanTitle ? { title: cleanTitle } : {}) } : event) })
    },
    deleteCalendarEvent: (id) => {
      const planner = get().data.planner
      updatePlanner({ ...planner, calendarEvents: planner.calendarEvents.filter((event) => event.id !== id) })
    },
    addTodo: (draft) => {
      const clean = draft.title.trim()
      if (!clean) return
      const planner = get().data.planner
      const repeat = draft.repeat ?? 'none'
      const todo: TodoItem = { id: makeId('todo'), title: clean, note: '', priority: 'medium', repeat, dueDate: repeat === 'none' ? draft.dueDate : undefined, repeatDays: repeat === 'weekly' ? draft.repeatDays : undefined, quotaPeriod: repeat === 'quota' ? draft.quotaPeriod ?? 'week' : undefined, quotaTarget: repeat === 'quota' ? Math.min(99, Math.max(1, draft.quotaTarget ?? 3)) : undefined, quotaCompletions: [], completed: false, completedDates: [], createdAt: new Date().toISOString() }
      updatePlanner({ ...planner, todos: [todo, ...planner.todos] })
    },
    updateTodo: (id, changes) => {
      const planner = get().data.planner
      updatePlanner({ ...planner, todos: planner.todos.map((todo) => todo.id === id ? { ...todo, ...changes } : todo) })
    },
    toggleTodoForDate: (id, date) => {
      const planner = get().data.planner
      updatePlanner({ ...planner, todos: planner.todos.map((todo) => {
        if (todo.id !== id) return todo
        if (!todo.repeat || todo.repeat === 'none') return { ...todo, completed: !todo.completed }
        const completedDates = todo.completedDates ?? []
        return { ...todo, completedDates: completedDates.includes(date) ? completedDates.filter((item) => item !== date) : [...completedDates, date] }
      }) })
    },
    toggleTodoHoliday: (date) => {
      const planner = get().data.planner
      const holidayDates = planner.holidayDates ?? []
      updatePlanner({ ...planner, holidayDates: holidayDates.includes(date) ? holidayDates.filter((item) => item !== date) : [...holidayDates, date] })
    },
    recordTodoCompletion: (id) => {
      const planner = get().data.planner
      updatePlanner({ ...planner, todos: planner.todos.map((todo) => todo.id === id ? { ...todo, quotaCompletions: [...(todo.quotaCompletions ?? []), { id: makeId('todo-completion'), completedAt: new Date().toISOString() }] } : todo) })
    },
    removeTodoCompletion: (id, completionId) => {
      const planner = get().data.planner
      updatePlanner({ ...planner, todos: planner.todos.map((todo) => todo.id === id ? { ...todo, quotaCompletions: (todo.quotaCompletions ?? []).filter((entry) => entry.id !== completionId) } : todo) })
    },
    deleteTodo: (id) => {
      const planner = get().data.planner
      updatePlanner({ ...planner, todos: planner.todos.filter((todo) => todo.id !== id) })
    },
  }
}
