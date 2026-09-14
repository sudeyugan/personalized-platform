import type { JSONContent } from '@tiptap/react'
import type { RecordType } from '../../domain/models'

const labels: Record<RecordType, string> = { person: '人物', place: '地点', event: '事件' }

export interface AnonymizedPreview { text: string; replacements: number }

export function anonymizeEntityReferences(content: JSONContent, limit = 360): AnonymizedPreview {
  const aliases = new Map<string, string>()
  const counts: Record<RecordType, number> = { person: 0, place: 0, event: 0 }
  let replacements = 0
  let lastEntity = ''

  const visit = (node: JSONContent): string => {
    if (node.type === 'text') {
      const mark = node.marks?.find((item) => item.type === 'entityReference')
      if (!mark) { lastEntity = ''; return node.text ?? '' }
      const type = mark.attrs?.entityType as RecordType
      const id = String(mark.attrs?.entityId ?? '')
      if (!labels[type] || !id) { lastEntity = ''; return node.text ?? '' }
      const key = `${type}:${id}`
      if (lastEntity === key) return ''
      lastEntity = key
      if (!aliases.has(key)) { counts[type] += 1; aliases.set(key, `【${labels[type]}${counts[type]}】`) }
      replacements += 1
      return aliases.get(key)!
    }
    const text = (node.content ?? []).map(visit).join('')
    if (['paragraph', 'heading', 'blockquote', 'listItem'].includes(node.type ?? '')) { lastEntity = ''; return `${text}\n` }
    return text
  }

  return { text: visit(content).trim().slice(0, limit), replacements }
}
