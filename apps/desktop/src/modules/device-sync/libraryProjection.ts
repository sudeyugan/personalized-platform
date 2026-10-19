import { put, record, validateRecords, type Collection, type Records } from '@yiyu/sync'
import type { LibraryData } from '../../domain/models'
import { normalizeLibrary } from '../../domain/seed'
import { sessionAfterRemovingChapter } from '../../state/chapterNavigation'

const root = { works: 'works', volumes: 'volumes', people: 'people', places: 'places', events: 'events', relations: 'personRelations', links: 'entityLinks' } as const
const planner = { todos: 'todos', assignments: 'assignments', diary: 'diaryEntries', moods: 'moodEntries', courses: 'courses', calendar: 'calendarEvents', questions: 'dailyQuestions' } as const
function protectedIds(data: LibraryData) {
  const works = new Set(data.works.filter(work => work.encrypted).map(work => work.id))
  const chapters = new Set(Object.values(data.chapters).filter(chapter => works.has(chapter.workId)).map(chapter => chapter.id))
  return { works, chapters }
}
function eligible(value: Record<string, unknown>, blocked: ReturnType<typeof protectedIds>) {
  return !blocked.works.has(String(value.workId ?? value.id)) && !blocked.chapters.has(String(value.id))
    && !blocked.chapters.has(String(value.sourceId)) && !blocked.chapters.has(String(value.targetId))
}
export function projectLibrary(data: LibraryData): Records {
  const records: Records = {}
  const blocked = protectedIds(data)
  const add = (collection: Collection, values: unknown[]) => {
    for (const item of values) {
      const value = item as Record<string, unknown>
      if (eligible(value, blocked)) put(records, collection, value)
    }
  }
  for (const [collection, field] of Object.entries(root)) add(collection as Collection, data[field as typeof root[keyof typeof root]])
  add('chapters', Object.values(data.chapters))
  for (const [collection, field] of Object.entries(planner)) add(collection as Collection, data.planner[field as typeof planner[keyof typeof planner]] ?? [])
  add('experiences', data.experiences?.entries ?? [])
  add('ideas', data.ideas?.sessions ?? [])
  return records
}
export function mergeLibrary(data: LibraryData, records: Records): LibraryData {
  validateRecords(records)
  const blocked = protectedIds(data)
  const merge = (collection: Collection, values: unknown[]) => {
    const existing = new Map(values.map(item => {
      const value = item as Record<string, unknown>
      return [String(collection === 'diary' ? value.date : value.id), value]
    }))
    const incoming = Object.entries(records).filter(([key]) => key.startsWith(`${collection}/`)).map(([, value]) => value)
    const kept = [...existing.values()].filter(value => !eligible(value, blocked))
    return [...kept, ...incoming.filter(value => eligible(value, blocked)).map(value => {
      const previous = existing.get(String(collection === 'diary' ? value.date : value.id)) ?? {}
      // Incoming records replace their syncable projection, including omitted
      // optional fields. Only device-local fields (assets, versions, etc.) survive.
      const syncable = record(collection, previous)
      const local = Object.fromEntries(Object.entries(previous).filter(([field]) => !Object.hasOwn(syncable, field)))
      return { ...local, ...value }
    })]
  }
  const result = structuredClone(data)
  const writable = result as unknown as Record<string, unknown>
  for (const [collection, field] of Object.entries(root)) writable[field] = merge(collection as Collection, data[field as typeof root[keyof typeof root]])
  const chapters: Record<string, unknown>[] = merge('chapters', Object.values(data.chapters)).map(value => ({ versions: [], ...value }))
  result.chapters = Object.fromEntries(chapters.map(value => [value.id, value])) as LibraryData['chapters']
  const plannerData = result.planner as unknown as Record<string, unknown>
  for (const [collection, field] of Object.entries(planner)) plannerData[field] = merge(collection as Collection, data.planner[field as typeof planner[keyof typeof planner]] ?? [])
  if (result.experiences) result.experiences.entries = merge('experiences', data.experiences?.entries ?? []) as unknown as NonNullable<LibraryData['experiences']>['entries']
  if (result.ideas) result.ideas.sessions = merge('ideas', data.ideas?.sessions ?? []) as unknown as NonNullable<LibraryData['ideas']>['sessions']
  const normalized = normalizeLibrary(result)
  // Normalization is useful for incoming records, not permission/preferences migration.
  const merged: LibraryData = {
    ...data,
    ...Object.fromEntries(Object.values(root).map(field => [field, normalized[field]])),
    chapters: normalized.chapters,
    planner: { ...data.planner, ...Object.fromEntries(Object.values(planner).map(field => [field, normalized.planner[field]])) },
    experiences: normalized.experiences,
    ideas: normalized.ideas,
  }
  merged.session = sessionAfterRemovingChapter(merged, '')
  if (!merged.works.some(work => work.id === merged.session.activeWorkId && !work.deletedAt)) merged.session.activeWorkId = merged.works.find(work => !work.deletedAt)?.id ?? ''
  return merged
}
