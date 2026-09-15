import type { Course, DiaryEntry, LibraryData, TodoItem } from '../domain/models'
import { libraryRepository } from '../infrastructure/libraryRepository'
import type { LibraryStore } from './libraryStoreTypes'

type SetStore = (partial: Partial<LibraryStore>) => void
const makeId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`
const commit = (data: LibraryData, set: SetStore) => { set({ data }); void libraryRepository.save(data) }

type PlannerActions = 'saveDiaryEntry' | 'openDiary' | 'addCourse' | 'updateCourse' | 'deleteCourse' | 'addTodo' | 'updateTodo' | 'toggleTodoForDate' | 'deleteTodo'

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
    addTodo: (title, repeat = 'none') => {
      const clean = title.trim()
      if (!clean) return
      const planner = get().data.planner
      const todo: TodoItem = { id: makeId('todo'), title: clean, note: '', priority: 'medium', repeat, completed: false, completedDates: [], createdAt: new Date().toISOString() }
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
    deleteTodo: (id) => {
      const planner = get().data.planner
      updatePlanner({ ...planner, todos: planner.todos.filter((todo) => todo.id !== id) })
    },
  }
}
