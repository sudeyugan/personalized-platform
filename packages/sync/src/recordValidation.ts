import type { Collection } from './types'

const arrays = new Set(['chapterIds', 'volumeIds', 'tags', 'aliases', 'customFields', 'rules', 'turns', 'draftVersions', 'quotaCompletions', 'completedDates', 'repeatDays'])
const numbers = new Set(['targetWords', 'wordCount', 'revision', 'manualOrder', 'day', 'order', 'quotaTarget'])
const objects = new Set(['points', 'periods', 'source', 'anchor'])
const booleans = new Set(['completed', 'draftEdited'])
export function validateRecordShape(collection: Collection, value: Record<string, unknown>) {
  for (const [field, item] of Object.entries(value)) {
    if (arrays.has(field)) {
      if (!Array.isArray(item)) throw new Error('同步资料列表格式无效。')
    } else if (numbers.has(field) || collection === 'courses' && field === 'period') {
      if (typeof item !== 'number' || !Number.isFinite(item)) throw new Error('同步资料数字格式无效。')
    } else if (objects.has(field) || collection === 'chapters' && field === 'content') {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('同步资料结构格式无效。')
    } else if (booleans.has(field)) {
      if (typeof item !== 'boolean') throw new Error('同步资料状态格式无效。')
    } else if (typeof item !== 'string') throw new Error('同步资料文本格式无效。')
  }
  if (['works', 'chapters', 'volumes', 'todos', 'assignments', 'calendar', 'experiences', 'ideas', 'diary', 'courses'].includes(collection) && typeof value.title !== 'string') throw new Error('同步记录缺少标题。')
  if (['people', 'places'].includes(collection) && typeof value.name !== 'string') throw new Error('同步记录缺少名称。')
  if (['chapters', 'volumes'].includes(collection) && typeof value.workId !== 'string') throw new Error('同步记录缺少所属作品。')
  if (collection === 'chapters' && (!value.content || typeof value.plainText !== 'string')) throw new Error('章节正文无效。')
  if (collection === 'moods') {
    const points = Object.values((value.points ?? {}) as Record<string, unknown>)
    if (!['morning', 'afternoon', 'evening'].includes(String(value.period)) || points.some(n => typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 5)
      || (points as number[]).reduce((a, b) => a + b, 0) !== 5) throw new Error('心情必须为早、中、晚的五点记录。')
  }
}
