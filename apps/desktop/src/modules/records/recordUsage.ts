import type { LibraryData, RecordUsage } from '../../domain/models'
import type { InlineField } from './InlineRecordEditor'

export type UsageFilter = 'all' | 'real' | 'fiction' | 'unclassified'
export interface RecordFilter { usage: UsageFilter; workId: string }
export const usageLabel = (record: RecordUsage) => record.usage === 'real' ? '现实记录' : record.usage === 'fiction' ? '作品设定' : '未分类'
export function matchesUsage(record: RecordUsage, filter?: RecordFilter) {
  if (!filter) return true
  return (filter.usage === 'all' || (filter.usage === 'unclassified' ? !record.usage : record.usage === filter.usage))
    && (!filter.workId || record.workId === filter.workId)
}
export function usageFields(record: RecordUsage, data: LibraryData): InlineField[] {
  return [
    { key: 'usage', label: '用途', value: record.usage ?? '', options: [{ value: '', label: '未分类' }, { value: 'real', label: '现实记录' }, { value: 'fiction', label: '作品设定' }] },
    { key: 'workId', label: '归属作品（可选，不改变正文关联）', value: record.workId ?? '', options: [{ value: '', label: '不指定作品' }, ...data.works.filter(work => !work.deletedAt).map(work => ({ value: work.id, label: work.title }))] },
  ]
}
export function usageChanges(values: Record<string, string>): RecordUsage {
  return { usage: values.usage === 'real' || values.usage === 'fiction' ? values.usage : undefined, workId: values.workId || undefined }
}
