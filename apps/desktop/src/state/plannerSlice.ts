import type { Course, DiaryEntry, LibraryData, TodoItem } from '../domain/models'
import { libraryRepository } from '../infrastructure/libraryRepository'
import type { LibraryStore } from './libraryStoreTypes'

type SetStore = (partial: Partial<LibraryStore>) => void
const makeId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`
const commit = (data: LibraryData, set: SetStore) => { set({ data }); void libraryRepository.save(data) }

type PlannerActions = 'saveDiaryEntry' | 'addCourse' | 'updateCourse' | 'deleteCourse' | 'addTodo' | 'updateTodo' | 'deleteTodo'

export function createPlannerSlice(get: () => LibraryStore, set: SetStore): Pick<LibraryStore, PlannerActions> {
  const updatePlanner = (planner: LibraryData['planner']) => commit({ ...get().data, planner }, set)
  return {
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
    addTodo: (title) => {
      const clean = title.trim()
      if (!clean) return
      const planner = get().data.planner
      const todo: TodoItem = { id: makeId('todo'), title: clean, note: '', priority: 'medium', completed: false, createdAt: new Date().toISOString() }
      updatePlanner({ ...planner, todos: [todo, ...planner.todos] })
    },
    updateTodo: (id, changes) => {
      const planner = get().data.planner
      updatePlanner({ ...planner, todos: planner.todos.map((todo) => todo.id === id ? { ...todo, ...changes } : todo) })
    },
    deleteTodo: (id) => {
      const planner = get().data.planner
      updatePlanner({ ...planner, todos: planner.todos.filter((todo) => todo.id !== id) })
    },
  }
}
