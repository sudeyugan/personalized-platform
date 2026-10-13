// Executes in the isolated world; only visible same-origin frame documents.
// No fields, cookies, storage,
// arbitrary selector/script or page-written messages are used as authority.
export function snapshotPage() {
  const cleanUrl = (raw, base = location.href) => { try { const url = new URL(raw, base); if (url.protocol !== 'https:' || url.username || url.password || url.port || !url.hostname.includes('.') || /^[\d.]+$/.test(url.hostname) || /\.(?:local|localhost|internal|test|invalid)$/.test(url.hostname)) return undefined; url.search = ''; url.hash = ''; return url.href } catch { return undefined } }
  const safeText = text => text.replace(/\bBearer\s+[\w.-]+/gi, '[已隐藏凭据]').replace(/\bsk-[\w-]{12,}/g, '[已隐藏密钥]').replace(/(?:密码|验证码|口令|令牌|password|token)\s*[:：=]\s*[^\s，。；;]+/gi, '[已隐藏敏感字段]')
  const excluded = 'script,style,noscript,template,input,textarea,select,form,[contenteditable],[aria-hidden="true"],[data-private]'
  const visible = node => Boolean(node && !node.closest(excluded) && node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden')
  const pieces = [], links = [], documents = [document], seen = new Set(documents)
  let length = 0, visits = 0, truncated = false, exhausted = false, loading = false
  for (let index = 0; index < documents.length; index++) {
    const doc = documents[index]; loading ||= doc.readyState !== 'complete'
    const walker = doc.createTreeWalker(doc.body ?? doc.documentElement, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      if (++visits > 10000) { truncated = true; exhausted = true; break }
      const node = walker.currentNode; if (!visible(node.parentElement)) continue
      const text = safeText((node.textContent ?? '').replace(/\s+/g, ' ').trim()); if (!text) continue
      if (length + text.length > 12000) { pieces.push(text.slice(0, Math.max(0, 12000 - length))); truncated = true; exhausted = true; break }
      pieces.push(text); length += text.length + 1
    }
    for (const link of doc.querySelectorAll('a[href]')) {
      if (links.length >= 40) break
      if (!visible(link)) continue
      const url = cleanUrl(link.getAttribute('href'), doc.baseURI); if (!url) continue
      links.push({ text: safeText((link.innerText ?? '').trim()).slice(0, 100), url })
    }
    if (exhausted) break
    for (const frame of doc.querySelectorAll('iframe,frame')) {
      if (!visible(frame)) continue
      try {
        // SOP is also enforced by the browser. Never request or inject scripts
        // into cross-origin frames, including another authorised mail site.
        const source = new URL(frame.getAttribute('src') || 'about:blank', doc.baseURI)
        if (!['about:blank', 'about:srcdoc'].includes(source.href) && source.origin !== location.origin) continue
        const inner = frame.contentDocument
        if (!inner || seen.has(inner) || (!['about:blank', 'about:srcdoc'].includes(inner.URL) && new URL(inner.URL).origin !== location.origin)) continue
        if (documents.length >= 4) { truncated = true; continue }
        seen.add(inner); documents.push(inner)
      } catch { /* Cross-origin, detached or sandboxed frame: do not read. */ }
    }
  }
  return { origin: location.origin, title: safeText(document.title).slice(0, 200), url: cleanUrl(location.href), text: pieces.join('\n').slice(0, 12000), links, truncated, loading }
}
