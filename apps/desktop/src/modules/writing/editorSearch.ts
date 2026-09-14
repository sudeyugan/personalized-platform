import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/react'

export interface EditorTextMatch { from: number; to: number }

export function findTextMatches(doc: ProseMirrorNode, query: string): EditorTextMatch[] {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return []
  const matches: EditorTextMatch[] = []
  doc.descendants((node, position) => {
    if (!node.isTextblock) return
    let text = ''
    const positions: number[] = []
    node.descendants((child, childPosition) => {
      if (!child.isText || !child.text) return
      for (let index = 0; index < child.text.length; index += 1) positions.push(position + 1 + childPosition + index)
      text += child.text
    })
    const comparableText = text.toLocaleLowerCase()
    let offset = 0
    while (offset <= comparableText.length - needle.length) {
      const index = comparableText.indexOf(needle, offset)
      if (index < 0) break
      matches.push({ from: positions[index], to: positions[index + needle.length - 1] + 1 })
      offset = index + Math.max(needle.length, 1)
    }
    return false
  })
  return matches
}

export function replaceAllText(editor: Editor, query: string, replacement: string) {
  const matches = findTextMatches(editor.state.doc, query)
  if (!matches.length) return 0
  const transaction = editor.state.tr
  for (const match of [...matches].reverse()) transaction.insertText(replacement, match.from, match.to)
  editor.view.dispatch(transaction)
  return matches.length
}
