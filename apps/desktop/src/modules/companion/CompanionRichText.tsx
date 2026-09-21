import { Fragment, type ReactNode } from 'react'

function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g)
  return parts.filter(Boolean).map((part, index) => {
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
  lines.forEach((line, index) => {
    if (line.trim().startsWith('```')) {
      if (code) { blocks.push(<pre key={`code-${index}`}><code>{code.join('\n')}</code></pre>); code = undefined } else code = []
      return
    }
    if (code) { code.push(line); return }
    if (!line.trim()) return
    const heading = line.match(/^#{1,4}\s+(.+)$/)
    if (heading) { blocks.push(<h4 key={index}>{inline(heading[1])}</h4>); return }
    const bullet = line.match(/^[-*]\s+(.+)$/)
    if (bullet) { blocks.push(<div className="companion-list-line" key={index}><i>•</i><span>{inline(bullet[1])}</span></div>); return }
    const numbered = line.match(/^(\d+)[.)]\s+(.+)$/)
    if (numbered) { blocks.push(<div className="companion-list-line" key={index}><i>{numbered[1]}.</i><span>{inline(numbered[2])}</span></div>); return }
    const quote = line.match(/^>\s?(.+)$/)
    if (quote) { blocks.push(<blockquote key={index}>{inline(quote[1])}</blockquote>); return }
    blocks.push(<p key={index}>{inline(line)}</p>)
  })
  if (code) blocks.push(<pre key="code-final"><code>{code.join('\n')}</code></pre>)
  return <div className="companion-rich-text">{blocks}</div>
}
