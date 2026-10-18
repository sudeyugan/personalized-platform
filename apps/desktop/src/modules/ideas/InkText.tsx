import type { CSSProperties } from 'react'

// Ink appears at several scattered sites, never along a reading-direction wipe.
// Stable runs keep selection and layout identical before/after developing.
function inkRuns(text: string): string[] {
  return text.match(/[^，。！？；：、\n]{1,6}[，。！？；：、\n]?|[，。！？；：、\n]/gu) ?? []
}

export function InkText({ text, reveal = false, offset = 0, className = '' }: {
  text: string; reveal?: boolean; offset?: number; className?: string
}) {
  return <span className={`idea-ink-text ${className}`} data-reveal={reveal || undefined}>
    {inkRuns(text).map((run, index) => <span className="idea-ink-run" key={index} style={{
      '--ink-delay': `${Math.min(offset + ((index * 137 + 71) % 430), 700)}ms`,
      '--ink-site-x': `${18 + (index * 29) % 65}%`, '--ink-site-y': `${20 + (index * 37) % 55}%`,
    } as CSSProperties}><span className="idea-ink-glyph">{run}</span></span>)}
  </span>
}

export function InkGesture({ kind = 'question' }: { kind?: 'question' | 'fold' | 'end' }) {
  return <svg className={`idea-gesture idea-gesture-${kind}`} viewBox="0 0 160 35" fill="none" aria-hidden="true">
    <path d={kind === 'question' ? 'M4 22 C29 8 42 25 67 15 S105 8 144 15 M12 25 Q63 14 116 20' : kind === 'fold' ? 'M2 18 Q44 23 77 17 T155 18 M71 12 L79 20 L87 12' : 'M3 20 C34 26 68 11 111 17 S141 23 156 13 M117 21 L145 20'} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M8 25 Q46 20 68 22 M96 18 L135 19" stroke="currentColor" opacity=".35" strokeWidth=".55" />
  </svg>
}
