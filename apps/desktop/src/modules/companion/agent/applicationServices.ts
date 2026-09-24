import type { LibraryData } from '../../../domain/models'

export interface AgentDataAccess {
  workIds: Set<string>
  chapterIds: Set<string>
  records: boolean
  todos: boolean
  calendar: boolean
  courses: boolean
  dailyQuestions: boolean
  diary: boolean
  mood: boolean
  memories: boolean
  answerBook: boolean
  music: boolean
  internet: boolean
}

export interface AgentApplicationServices {
  getCurrentWork(): unknown | undefined
  searchChapters(query: string): unknown[]
  getChapter(id: string): unknown | undefined
  searchCharacters(query: string): unknown[]
  searchPlaces(query: string): unknown[]
  searchTimeline(query: string): unknown[]
  getRecord(type: string, id: string): unknown | undefined
  listTodos(date?: string, status?: string): unknown[]
  listCalendarEvents(from?: string, to?: string): unknown[]
  listCourses(day?: string): unknown[]
  searchDiary(query?: string, from?: string, to?: string): unknown[]
  getDiary(date: string): unknown | undefined
  getMoodDay(date: string): unknown[]
  getMoodSummary(range: string, referenceDate: string): unknown
  listDailyQuestions(from?: string, to?: string): unknown[]
  searchMemories(query?: string): unknown[]
  listAnswerBookFavorites(query?: string): unknown[]
  listAssets(query?: string): unknown[]
  getCurrentMusic(): unknown
  searchWeb?(query: string): Promise<unknown[]>
  createTodo?(title: string, dueDate?: string): unknown
  updateTodo?(input: { id: string; title?: string; note?: string; dueDate?: string; priority?: string }): unknown
  setTodoCompleted?(id: string, date: string, completed: boolean): unknown
  setTodoHoliday?(date: string, holiday: boolean): unknown
  createCalendarEvent?(title: string, date: string, time?: string): unknown
  updateCalendarEvent?(input: { id: string; title?: string; date?: string; time?: string; note?: string }): unknown
  appendDiary?(date: string, title: string | undefined, content: string): unknown
  writeDiary?(date: string, title: string, content: string): unknown
  saveMood?(date: string, period: string, pointsJson: string, note?: string): unknown
  createWork?(title: string): unknown
  renameCurrentWork?(title: string): unknown
  createChapter?(title: string): unknown
  renameChapter?(id: string, title: string): unknown
  appendChapter?(id: string, content: string): unknown
  createRecord?(input: { type: string; name: string; description?: string; time?: string }): unknown
  updateRecord?(input: { type: string; id: string; name?: string; description?: string; time?: string }): unknown
  createCourse?(input: { title: string; day: number; period: number; teacher?: string; location?: string; weeks?: string; note?: string }): unknown
  updateCourse?(input: { id: string; title?: string; day?: number; period?: number; teacher?: string; location?: string; weeks?: string; note?: string }): unknown
  saveMemory?(content: string): unknown
  openDestination?(input: { destination: string; date?: string; range?: string; targetId?: string; filter?: string; section?: string }): unknown
  controlMusic?(action: string): unknown
}

export type AgentWriteServices = Pick<AgentApplicationServices, 'createTodo' | 'updateTodo' | 'setTodoCompleted' | 'setTodoHoliday' | 'createCalendarEvent' | 'updateCalendarEvent' | 'appendDiary' | 'writeDiary' | 'saveMood' | 'createWork' | 'renameCurrentWork' | 'createChapter' | 'renameChapter' | 'appendChapter' | 'createRecord' | 'updateRecord' | 'createCourse' | 'updateCourse' | 'saveMemory' | 'openDestination' | 'controlMusic' | 'searchWeb'>

function excerpt(text: string, query: string) {
  const index = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase())
  const start = Math.max(0, index < 0 ? 0 : index - 36)
  return text.slice(start, start + 180)
}

export function createAgentApplicationServices(data: LibraryData, access: AgentDataAccess, writes: AgentWriteServices = {}): AgentApplicationServices {
  const availableChapters = () => Object.values(data.chapters).filter((chapter) =>
    !chapter.deletedAt && access.chapterIds.has(chapter.id) && access.workIds.has(chapter.workId))

  return {
    ...writes,
    getCurrentWork() {
      const work = data.works.find((item) => item.id === data.session.activeWorkId && !item.deletedAt && access.workIds.has(item.id))
      if (!work) return undefined
      return {
        id: work.id,
        title: work.title,
        description: work.description,
        chapterCount: work.chapterIds.filter((id) => Boolean(data.chapters[id] && !data.chapters[id].deletedAt)).length,
        targetWords: work.targetWords,
      }
    },
    searchChapters(query) {
      const needle = query.trim().toLocaleLowerCase()
      if (!needle) return []
      return availableChapters()
        .filter((chapter) => `${chapter.title}\n${chapter.plainText}`.toLocaleLowerCase().includes(needle))
        .slice(0, 12)
        .map((chapter) => ({ id: chapter.id, title: chapter.title, excerpt: excerpt(chapter.plainText, needle), workId: chapter.workId }))
    },
    getChapter(id) {
      const chapter = availableChapters().find((item) => item.id === id)
      return chapter ? { id: chapter.id, title: chapter.title, plainText: chapter.plainText.slice(0, 4000), revision: chapter.revision, workId: chapter.workId } : undefined
    },
    searchCharacters(query) {
      if (!access.records) return []
      const needle = query.trim().toLocaleLowerCase()
      if (!needle) return []
      return data.people
        .filter((person) => !person.deletedAt && [person.name, ...person.aliases, person.summary].some((value) => value.toLocaleLowerCase().includes(needle)))
        .slice(0, 12)
        .map((person) => ({ id: person.id, name: person.name, aliases: person.aliases, summary: person.summary, tags: person.tags }))
    },
    searchPlaces(query) {
      if (!access.records) return []
      const needle = query.trim().toLocaleLowerCase()
      if (!needle) return []
      return data.places
        .filter((place) => !place.deletedAt && [place.name, ...place.aliases, place.region, place.description, place.address, place.relatedPeriod, ...place.tags].some((value) => value.toLocaleLowerCase().includes(needle)))
        .slice(0, 12)
        .map((place) => ({ id: place.id, name: place.name, region: place.region, description: place.description, aliases: place.aliases, tags: place.tags }))
    },
    searchTimeline(query) {
      if (!access.records) return []
      const needle = query.trim().toLocaleLowerCase()
      if (!needle) return []
      return data.events
        .filter((event) => !event.deletedAt && [event.title, event.displayTime, event.description].some((value) => value.toLocaleLowerCase().includes(needle)))
        .slice(0, 12)
        .map((event) => ({ id: event.id, title: event.title, displayTime: event.displayTime, description: event.description }))
    },
    getRecord(type, id) {
      if (!access.records) return undefined
      if (type === 'character') return data.people.find((item) => item.id === id && !item.deletedAt)
      if (type === 'place') return data.places.find((item) => item.id === id && !item.deletedAt)
      if (type === 'timeline') return data.events.find((item) => item.id === id && !item.deletedAt)
      return undefined
    },
    listTodos(date, status = 'all') {
      if (!access.todos) return []
      return data.planner.todos.filter((todo) => {
        const completed = !todo.repeat || todo.repeat === 'none' ? todo.completed : Boolean(date && todo.completedDates?.includes(date))
        return status === 'all' || (status === 'completed' ? completed : !completed)
      }).slice(0, 100).map((todo) => ({ ...todo, quotaCompletions: todo.quotaCompletions?.length ?? 0 }))
    },
    listCalendarEvents(from, to) {
      if (!access.calendar) return []
      return data.planner.calendarEvents.filter((event) => (!from || event.date >= from) && (!to || event.date <= to)).sort((a, b) => `${a.date} ${a.time ?? ''}`.localeCompare(`${b.date} ${b.time ?? ''}`)).slice(0, 100)
    },
    listCourses(day) {
      if (!access.courses) return []
      const dayNumber = day ? Number(day) : undefined
      return data.planner.courses.filter((course) => !dayNumber || course.day === dayNumber).map((course) => ({ ...course }))
    },
    searchDiary(query, from, to) {
      if (!access.diary) return []
      const needle = query?.trim().toLocaleLowerCase()
      return data.planner.diaryEntries.filter((entry) => (!from || entry.date >= from) && (!to || entry.date <= to) && (!needle || `${entry.title}\n${entry.content}`.toLocaleLowerCase().includes(needle))).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).map((entry) => ({ date: entry.date, title: entry.title, excerpt: excerpt(entry.content, needle ?? ''), updatedAt: entry.updatedAt }))
    },
    getDiary(date) {
      if (!access.diary) return undefined
      const entry = data.planner.diaryEntries.find((item) => item.date === date)
      return entry ? { ...entry, content: entry.content.slice(0, 6000) } : undefined
    },
    getMoodDay(date) {
      if (!access.mood) return []
      return data.planner.moodEntries.filter((entry) => entry.date === date).map((entry) => ({ period: entry.period, points: entry.points, note: entry.note }))
    },
    getMoodSummary(range, referenceDate) {
      if (!access.mood) return { entries: [] }
      const reference = new Date(`${referenceDate}T12:00:00`)
      const start = range === 'month' ? new Date(reference.getFullYear(), reference.getMonth(), 1, 12) : new Date(reference)
      if (range === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
      const end = range === 'month' ? new Date(reference.getFullYear(), reference.getMonth() + 1, 0, 12) : new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 12)
      const local = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
      const from = local(start); const to = local(end)
      const entries = data.planner.moodEntries.filter((entry) => entry.date >= from && entry.date <= to)
      const totals: Record<string, number> = {}
      entries.forEach((entry) => Object.entries(entry.points).forEach(([kind, count]) => { totals[kind] = (totals[kind] ?? 0) + (count ?? 0) }))
      return { range, from, to, recordCount: entries.length, totals, entries: entries.map((entry) => ({ date: entry.date, period: entry.period, points: entry.points, note: entry.note })) }
    },
    listDailyQuestions(from, to) {
      if (!access.dailyQuestions) return []
      return data.planner.dailyQuestions.filter((item) => (!from || item.date >= from) && (!to || item.date <= to)).slice(-90)
    },
    searchMemories(query) {
      if (!access.memories) return []
      const needle = query?.trim().toLocaleLowerCase()
      return data.companion.memories.filter((item) => item.authorized && (!needle || item.content.toLocaleLowerCase().includes(needle))).slice(-30).map(({ id, content, sourceLabel, updatedAt, confidence }) => ({ id, content, sourceLabel, updatedAt, confidence }))
    },
    listAnswerBookFavorites(query) {
      if (!access.answerBook) return []
      const needle = query?.trim().toLocaleLowerCase()
      return data.answerBook.favorites.filter((item) => !needle || `${item.question}\n${item.answer}`.toLocaleLowerCase().includes(needle)).slice(-50)
    },
    listAssets(query) {
      if (!access.records) return []
      const needle = query?.trim().toLocaleLowerCase()
      return data.assets.filter((item) => !item.deletedAt && (!needle || `${item.fileName}\n${item.alt}\n${item.caption}`.toLocaleLowerCase().includes(needle))).slice(0, 50).map(({ id, fileName, mimeType, alt, caption, createdAt }) => ({ id, fileName, mimeType, alt, caption, createdAt }))
    },
    getCurrentMusic() {
      if (!access.music) return { allowed: false }
      const track = data.tracks.find((item) => item.id === data.session.currentTrackId && !item.deletedAt)
      return track ? { id: track.id, title: track.title, artist: track.artist } : { playing: false, track: null }
    },
  }
}
