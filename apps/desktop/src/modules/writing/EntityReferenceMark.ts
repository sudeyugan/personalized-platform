import { Mark, mergeAttributes } from '@tiptap/core'
import type { RecordType } from '../../domain/models'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    entityReference: {
      setEntityReference: (attributes: { entityType: RecordType; entityId: string; label: string }) => ReturnType
      unsetEntityReference: () => ReturnType
    }
  }
}

export const EntityReferenceMark = Mark.create({
  name: 'entityReference',
  inclusive: false,
  excludes: '',
  addAttributes() {
    return {
      entityType: { default: null, parseHTML: (element) => element.getAttribute('data-entity-type') },
      entityId: { default: null, parseHTML: (element) => element.getAttribute('data-entity-id') },
      label: { default: '', parseHTML: (element) => element.getAttribute('data-entity-label') ?? '' },
    }
  },
  parseHTML() { return [{ tag: 'span[data-entity-reference]' }] },
  renderHTML({ HTMLAttributes }) {
    const type = HTMLAttributes.entityType as RecordType
    const typeLabel = type === 'person' ? '人物' : type === 'place' ? '地点' : '事件'
    return ['span', mergeAttributes({
      'data-entity-reference': '',
      'data-entity-type': type,
      'data-entity-id': HTMLAttributes.entityId,
      'data-entity-label': HTMLAttributes.label,
      class: `entity-reference entity-${type}`,
      title: `${typeLabel}：${HTMLAttributes.label}`,
    }), 0]
  },
  addCommands() {
    return {
      setEntityReference: (attributes) => ({ commands }) => commands.setMark(this.name, attributes),
      unsetEntityReference: () => ({ commands }) => commands.unsetMark(this.name),
    }
  },
})
