import type { LibraryData } from '../../../domain/models'

export interface AgentDataAccess {
  workIds: Set<string>
  chapterIds: Set<string>
  records: boolean
}

export interface AgentApplicationServices {
  getCurrentWork(): unknown | undefined
  searchChapters(query: string): unknown[]
  getChapter(id: string): unknown | undefined
  searchCharacters(query: string): unknown[]
  searchPlaces(query: string): unknown[]
  searchTimeline(query: string): unknown[]
  createTodo?(title: string, dueDate?: string): unknown
  updateTodo?(input: { id: string; title?: string; note?: string; dueDate?: string; priority?: string }): unknown
  setTodoCompleted?(id: string, date: string, completed: boolean): unknown
  createCalendarEvent?(title: string, date: string, time?: string): unknown
  updateCalendarEvent?(input: { id: string; title?: string; date?: string; time?: string; note?: string }): unknown
  appendDiary?(date: string, title: string | undefined, content: string): unknown
  writeDiary?(date: string, title: string, content: string): unknown
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
  navigate?(view: string): unknown
  controlMusic?(action: string): unknown
}

export type AgentWriteServices = Pick<AgentApplicationServices, 'createTodo' | 'updateTodo' | 'setTodoCompleted' | 'createCalendarEvent' | 'updateCalendarEvent' | 'appendDiary' | 'writeDiary' | 'createWork' | 'renameCurrentWork' | 'createChapter' | 'renameChapter' | 'appendChapter' | 'createRecord' | 'updateRecord' | 'createCourse' | 'updateCourse' | 'saveMemory' | 'navigate' | 'controlMusic'>

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
  }
}
