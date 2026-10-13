import { invoke } from '@tauri-apps/api/core'
import { useRef, useState, type MouseEvent } from 'react'

// A human click, not an Agent tool or browser permission grant. Desktop
// WebView target=_blank is not an OS browser opener; use the narrow command.
export function ReplyLink({ href, children }: { href: string; children: string }) {
  const busy = useRef(false)
  const [error, setError] = useState(false)
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.type === 'auxclick' && event.button !== 1) return
    if (!('__TAURI_INTERNALS__' in window)) return // normal browser preview link
    event.preventDefault()
    event.stopPropagation()
    if (busy.current) return
    busy.current = true
    setError(false)
    void invoke('open_reply_link', { url: href })
      .catch(() => setError(true)) // never expose native errors or private URLs
      .finally(() => { busy.current = false })
  }
  return <><a href={href} target="_blank" rel="noopener noreferrer" onClick={open} onAuxClick={open}>{children}</a>{error && <small role="alert">未能打开链接，可复制链接到浏览器；仅支持安全的 HTTPS 网页。</small>}</>
}
