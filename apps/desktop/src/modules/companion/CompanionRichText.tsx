import { Fragment, type ReactNode } from 'react'

function inline(text: string): ReactNode[] {
  const parts = text.split(/(\\[\\`*[\]#>_~.+()-]|\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g)
  return parts.filter(Boolean).map((part, index) => {
    if (/^\\[\\`*[\]#>_~.+()-]$/.test(part)) return <Fragment key={index}>{part.slice(1)}</Fragment>
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (link && /^https?:\/\//i.test(link[2])) return <a href={link[2]} target="_blank" rel="noreferrer" key={index}>{link[1]}</a>
    if (link) return <Fragment key={index}>{link[1]}</Fragment>
    return <Fragment key={index}>{part}</Fragment>
  })
}

export function CompanionRichText({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n')
  const blocks: ReactNode[] = []
  let code: string[] | undefined
  let fence = ''
  let listDetailIndex = -1
  lines.forEach((line, index) => {
    if (index === listDetailIndex) return
    const marker = line.trim().match(/^(`{3,})(.*)$/)
    if (code) {
      if (marker && marker[1].length >= fence.length && !marker[2].trim()) { blocks.push(<pre key={`code-${index}`}><code>{code.join('\n')}</code></pre>); code = undefined }
      else code.push(line)
      return
    }
    if (marker) { code = []; fence = marker[1]; return }
    if (!line.trim()) return
    const heading = line.match(/^#{1,4}\s+(.+)$/)
    if (heading) { blocks.push(<h4 key={index}>{inline(heading[1])}</h4>); return }
    const bullet = line.match(/^[-*]\s+(.+)$/)
    if (bullet) {
      const detail = lines[index + 1]?.match(/^ {2}(?!```)(\S.*)$/)
      if (detail) listDetailIndex = index + 1
      blocks.push(<div className="companion-list-line" key={index}><i>•</i><span>{inline(bullet[1])}{detail && <small className="companion-list-detail">{inline(detail[1])}</small>}</span></div>)
      return
    }
    const numbered = line.match(/^(\d+)[.)]\s+(.+)$/)
    if (numbered) { blocks.push(<div className="companion-list-line" key={index}><i>{numbered[1]}.</i><span>{inline(numbered[2])}</span></div>); return }
    const quote = line.match(/^>\s?(.+)$/)
    if (quote) { blocks.push(<blockquote key={index}>{inline(quote[1])}</blockquote>); return }
    blocks.push(<p key={index}>{inline(line)}</p>)
  })
  if (code) blocks.push(<pre key="code-final"><code>{code.join('\n')}</code></pre>)
  const status = lines[0]?.match(/^## (已完成|等待后续|部分结果|未找到|未完成|已取消|尚未确认) · /)?.[1]
  return <div className={`companion-rich-text${status ? ' companion-result' : ''}`} data-result-state={status}>{blocks}</div>
}
