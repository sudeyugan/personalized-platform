import { Node, mergeAttributes, type JSONContent } from '@tiptap/core'
// Same serialized node as PC; no URL/image fetching and no missing-asset deletion.
export const MobileImageAsset = Node.create({
  name: 'imageAsset',
  group: 'block',
  atom: true,
  draggable: false,
  addAttributes() {
    return {
      assetId: { default: '' },
      alt: { default: '' },
      caption: { default: '' },
      width: { default: 72 },
      align: { default: 'center' },
    }
  },
  parseHTML() {
    return [{ tag: 'figure[data-asset-id]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'figure',
      mergeAttributes({
        'data-asset-id': HTMLAttributes.assetId,
        class: 'mobile-asset-placeholder',
        contenteditable: 'false',
      }),
      ['span', {}, HTMLAttributes.caption || HTMLAttributes.alt || '图片在原设备上 · 引用仍保留'],
    ]
  },
})
const nodes: Record<string, string[]> = {
  doc: [],
  paragraph: ['textAlign', 'lineHeight'],
  text: [],
  heading: ['level', 'textAlign', 'lineHeight'],
  blockquote: [],
  bulletList: [],
  orderedList: ['start', 'type'],
  listItem: [],
  taskList: [],
  taskItem: ['checked'],
  hardBreak: [],
  horizontalRule: [],
  codeBlock: ['language'],
  imageAsset: ['assetId', 'alt', 'caption', 'width', 'align'],
}
const marks: Record<string, string[]> = {
  bold: [],
  italic: [],
  underline: [],
  strike: [],
  code: [],
  link: ['href', 'target', 'rel', 'class'],
  highlight: ['color'],
  entityReference: ['entityType', 'entityId', 'label'],
  authorAnnotation: ['id', 'note', 'createdAt'],
}
export function supportedDocument(document: JSONContent): boolean {
  const supported = (item: JSONContent, definitions: Record<string, string[]>) =>
    Boolean(item.type && Object.hasOwn(definitions, item.type)) &&
    Object.keys(item.attrs ?? {}).every((attr) => definitions[item.type!].includes(attr))
  return (
    supported(document, nodes) &&
    (document.marks ?? []).every((mark) => supported(mark, marks)) &&
    (document.content ?? []).every(supportedDocument)
  )
}
