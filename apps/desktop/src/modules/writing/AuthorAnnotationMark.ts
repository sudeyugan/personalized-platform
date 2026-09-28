import { Mark, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    authorAnnotation: {
      setAuthorAnnotation: (attributes: { id: string; note: string; createdAt: string }) => ReturnType
      unsetAuthorAnnotation: () => ReturnType
    }
  }
}

export const AuthorAnnotationMark = Mark.create({
  name: 'authorAnnotation', inclusive: false, excludes: '',
  addAttributes() { return { id: { default: null, parseHTML: (element) => element.getAttribute('data-annotation-id') }, note: { default: '', parseHTML: (element) => element.getAttribute('data-annotation-note') ?? '' }, createdAt: { default: '', parseHTML: (element) => element.getAttribute('data-annotation-created-at') ?? '' } } },
  parseHTML() { return [{ tag: 'span[data-author-annotation]' }] },
  renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes({ 'data-author-annotation': '', 'data-annotation-id': HTMLAttributes.id, 'data-annotation-note': HTMLAttributes.note, 'data-annotation-created-at': HTMLAttributes.createdAt, class: 'author-annotation', title: HTMLAttributes.note }), 0] },
  addCommands() { return { setAuthorAnnotation: (attributes) => ({ commands }) => commands.setMark(this.name, attributes), unsetAuthorAnnotation: () => ({ commands }) => commands.unsetMark(this.name) } },
})
