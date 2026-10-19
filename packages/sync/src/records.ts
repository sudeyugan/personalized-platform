import { type Collection, type Records, stableJson, validKey } from './types'
import { validateRecordShape } from './recordValidation'

// Allowlist: new settings/secrets fields cannot silently become syncable.
const fields: Record<Collection, string[]> = {
  works: ['id', 'kind', 'title', 'description', 'chapterIds', 'targetWords', 'createdAt', 'updatedAt', 'volumeIds', 'deletedAt'],
  chapters: ['id', 'workId', 'title', 'content', 'plainText', 'wordCount', 'revision', 'status', 'updatedAt', 'volumeId', 'deletedAt', 'summary'],
  volumes: ['id', 'workId', 'title', 'chapterIds', 'createdAt', 'updatedAt', 'deletedAt'],
  people: ['id', 'name', 'summary', 'tags', 'chapterIds', 'aliases', 'importantExperiences', 'customFields', 'deletedAt', 'usage', 'workId'],
  places: ['id', 'name', 'region', 'description', 'chapterIds', 'aliases', 'address', 'relatedPeriod', 'tags', 'customFields', 'deletedAt', 'usage', 'workId'],
  events: ['id', 'title', 'displayTime', 'precision', 'description', 'chapterIds', 'startDate', 'endDate', 'sortTime', 'manualOrder', 'customFields', 'deletedAt', 'usage', 'workId'],
  relations: ['id', 'fromPersonId', 'toPersonId', 'relationType', 'description'],
  links: ['id', 'sourceType', 'sourceId', 'targetType', 'targetId', 'relationType', 'anchor', 'createdAt'],
  todos: ['id', 'title', 'note', 'dueDate', 'priority', 'repeat', 'repeatDays', 'quotaPeriod', 'quotaTarget', 'quotaCompletions', 'completed', 'completedDates', 'createdAt'],
  assignments: ['id', 'title', 'subject', 'note', 'rules', 'periods', 'createdAt', 'deletedAt'],
  diary: ['date', 'title', 'content', 'updatedAt'],
  moods: ['id', 'date', 'period', 'points', 'note', 'createdAt', 'updatedAt'],
  courses: ['id', 'title', 'day', 'period', 'teacher', 'location', 'weeks', 'note'],
  calendar: ['id', 'title', 'date', 'time', 'note'],
  questions: ['id', 'date', 'question', 'background', 'followUp', 'topic', 'tone', 'createdAt'],
  experiences: ['id', 'category', 'title', 'creator', 'dateText', 'note', 'paperStyle', 'tier', 'order', 'source', 'createdAt', 'updatedAt', 'deletedAt'],
  ideas: ['id', 'seed', 'title', 'createdAt', 'updatedAt', 'revision', 'turns', 'draft', 'draftEdited', 'draftVersions', 'status', 'forkOf', 'deletedAt'],
}
export function record(collection: Collection, value: Record<string, unknown>): Record<string, unknown> {
  const result = Object.fromEntries(fields[collection].filter(key => value[key] !== undefined).map(key => [key, value[key]]))
  if (collection === 'works') result.volumeIds ??= []
  if (collection === 'chapters') result.summary ??= ''
  if (collection === 'moods') result.id = `${result.date}-${result.period}`
  return JSON.parse(JSON.stringify(result)) as Record<string, unknown>
}
export function put(records: Records, collection: Collection, value: Record<string, unknown>) {
  const projected = record(collection, value)
  const id = collection === 'diary' ? projected.date : projected.id
  const key = `${collection}/${id}`
  if (!validKey(key)) throw new Error('记录标识不支持同步。')
  records[key] = projected
}
export function validateRecords(records: Records): void {
  for (const [key, value] of Object.entries(records)) {
    if (!validKey(key) || !value || typeof value !== 'object' || Array.isArray(value)) throw new Error('同步资料格式无效。')
    const [collection, id] = key.split('/') as [Collection, string]
    if (String(collection === 'diary' ? value.date : value.id) !== id || stableJson(record(collection, value)) !== stableJson(value)) throw new Error('同步资料包含未知字段或标识不符；未写入。')
    validateRecordShape(collection, value)
  }
}
