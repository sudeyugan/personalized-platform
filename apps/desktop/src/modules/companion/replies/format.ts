import type { ReplyBlock, ReplyDocument } from './types'
import { replyStateLabels } from './types'
import { inlineText, safeReplyUrl } from './safety'

export function formatBlocks(blocks: ReplyBlock[]): string[] {
  return blocks.flatMap(block => {
    if (block.type === 'text') return block.text.split(/\n\s*\n/).map(paragraph => inlineText(paragraph))
    if (block.type === 'code') {
      const longest = Math.max(2, ...(block.text.match(/`+/g) ?? []).map(value => value.length))
      const fence = '`'.repeat(longest + 1)
      return [`${fence}\n${block.text}\n${fence}`]
    }
    return [block.items.map(item => {
      const url = safeReplyUrl(item.link?.url)
      const link = url ? ` · [${inlineText(item.link!.label)}](${url.replace(/\(/g, '%28').replace(/\)/g, '%29')})` : ''
      return `- ${inlineText(item.title)}${link}${item.detail ? `\n  ${inlineText(item.detail)}` : ''}`
    }).join('\n')]
  }).filter(Boolean)
}
export function formatReply(document: ReplyDocument) {
  return [
    `## ${replyStateLabels[document.state]} · ${inlineText(document.title)}`,
    ...formatBlocks(document.blocks),
    ...document.notes.filter(Boolean).map(note => `> ${inlineText(note)}`),
  ].join('\n\n')
}
