import type { CoverHints } from './coverMatching'

// Only explicit title/author syntax is split. Do not guess that a space in a
// multi-word title means an author, or rewrite a misspelling into another work.
export function novelCoverHints(hints: CoverHints): CoverHints {
  const query = hints.title.normalize('NFKC').replace(/[\u200b\ufeff]/gu, '').trim()
  let title = query, creator = hints.creator.trim()
  const quoted = /^《([^》]+)》(.*)$/u.exec(query)
  const explicitAuthor = /^(.*?)作者[:：]\s*(.+)$/u.exec(query)
  if (quoted) {
    title = quoted[1].trim()
    if (!creator) creator = quoted[2].trim().replace(/^[-—\s:：]+/u, '').replace(/^作者[:：\s]*/u, '').replace(/著$/u, '').trim()
  } else if (explicitAuthor) {
    title = explicitAuthor[1].trim()
    if (!creator) creator = explicitAuthor[2].replace(/著$/u, '').trim()
  }
  title = title.replace(/^[《》“”"]+|[《》“”"]+$/gu, '').trim()
  if (!/[a-z\d]/iu.test(title)) title = title.replace(/\s/gu, '')
  return { ...hints, title, creator }
}
