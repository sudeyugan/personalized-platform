import type { JSONContent } from '@tiptap/react'

const special = new Set(['.', '*', '+', '?', '^', String.fromCharCode(36), '{', '}', '(', ')', '|', '[', ']', String.fromCharCode(92)])
const escaped = (value: string) => [...value].map((character) => special.has(character) ? String.fromCharCode(92) + character : character).join('')
const matcher = (query: string) => query.trim() ? new RegExp(escaped(query.trim()), 'giu') : null

export function countContentMatches(content: JSONContent, query: string) {
  const pattern = matcher(query)
  if (!pattern) return 0
  let count = 0
  const visit = (node: JSONContent) => { if (typeof node.text === 'string') count += [...node.text.matchAll(pattern)].length; node.content?.forEach(visit) }
  visit(content)
  return count
}

export function replaceTextInContent(content: JSONContent, query: string, replacement: string) {
  const pattern = matcher(query)
  if (!pattern) return { content, count: 0 }
  let count = 0
  const visit = (node: JSONContent): JSONContent => {
    const next = { ...node }
    if (typeof node.text === 'string') next.text = node.text.replace(pattern, () => { count += 1; return replacement })
    if (node.content) next.content = node.content.map(visit)
    return next
  }
  return { content: visit(content), count }
}

const blockNodes = new Set(['paragraph', 'heading', 'blockquote', 'listItem', 'taskItem', 'codeBlock'])
export function contentToPlainText(content: JSONContent) {
  const parts: string[] = []
  const visit = (node: JSONContent) => { if (typeof node.text === 'string') parts.push(node.text); node.content?.forEach(visit); if (node.type && blockNodes.has(node.type) && parts.at(-1) !== '\n') parts.push('\n') }
  visit(content)
  return parts.join('').replace(/\n{3,}/g, '\n\n').replace(/\n$/, '')
}
