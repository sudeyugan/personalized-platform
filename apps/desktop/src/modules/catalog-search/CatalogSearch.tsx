import { useEffect, useRef, useState } from 'react'
import { useLibraryStore } from '../../state/useLibraryStore'
import { searchCatalog, safePublicLink, type CatalogSearchResult } from '../../infrastructure/catalogSearch'
import type { PrivacyReviewRequest } from '../privacy/types'
import { PrivacyReviewCard } from '../companion/PrivacyReviewCard'
import './catalogSearch.css'

export function CatalogSearch({ query, disabled, onQuery }: { query: string; disabled?: boolean; onQuery?: (query: string) => void }) {
  const [ai, setAi] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  const [result, setResult] = useState<CatalogSearchResult>(), [review, setReview] = useState<PrivacyReviewRequest>()
  const pending = useRef<((allowed: boolean) => void) | undefined>(undefined), controller = useRef<AbortController | undefined>(undefined)
  const web = useLibraryStore(store => store.data.settings.webSearch)
  const aiAllowed = useLibraryStore(store => store.data.settings.trust.externalAiProcessing && store.data.companion.provider.providerId === 'deepseek')
  const cancel = () => { controller.current?.abort(); pending.current?.(false); pending.current = undefined }
  useEffect(() => { cancel(); setReview(undefined); setResult(undefined); setBusy(false); return cancel }, [query])
  const run = async () => {
    if (busy) return
    const current = new AbortController(); controller.current = current
    setBusy(true); setMessage('正在找公开线索…'); setResult(undefined)
    try {
      const found = await searchCatalog(query.trim().slice(0, 200), useLibraryStore.getState().data, ai && aiAllowed, request => new Promise(resolve => {
        if (current.signal.aborted) { resolve(false); return }
        pending.current = resolve; setReview(request)
      }), current.signal, () => useLibraryStore.getState().data)
      if (!current.signal.aborted) { setResult(found); setMessage(found.warning || (found.links.length ? '线索并非已验证匹配；确认后再采用名称或官方作品链接。' : '没有找到公开线索，可继续手动记录或导入LRC。')) }
    } catch (error) { if (!current.signal.aborted) setMessage(error instanceof Error ? error.message : '搜索未完成') }
    finally { if (!current.signal.aborted) { setBusy(false); setReview(undefined); pending.current = undefined } }
  }
  const provider = web.providerId === 'tencent' ? '腾讯云搜索' : web.providerId === 'bocha' ? '博查搜索' : 'Bing'
  return <details className="catalog-search"><summary>辅助搜索公开线索</summary>
    <p>点击将把下面的搜索词发送给{provider}{web.fallbackToBing && web.providerId !== 'bing' ? '（失败可回退Bing）' : ''}。不发送感想、聊天或收藏列表。</p>
    <code>{query || '先填写作品名或播放歌曲'}</code>
    <label><input type="checkbox" checked={ai} disabled={!aiAllowed || busy} onChange={event => setAi(event.target.checked)} />同时用DeepSeek整理别名/版本线索{!aiAllowed && '（需启用DeepSeek及外部AI处理）'}</label>
    {ai && <p>另向DeepSeek发送此搜索词和最多6条公开标题/摘要；会使用现有密钥与API额度。</p>}
    <button type="button" disabled={disabled || busy || !query.trim() || !('__TAURI_INTERNALS__' in window)} onClick={() => void run()}>{busy ? '正在搜索…' : '搜索这些信息'}</button>
    {busy && <button type="button" onClick={() => { cancel(); setBusy(false); setReview(undefined); setMessage('已取消后续处理，已发出的网络请求可能仍在完成') }}>取消</button>}
    {review && <PrivacyReviewCard request={review} onDecision={allowed => { pending.current?.(allowed); pending.current = undefined; setReview(undefined) }} />}
    {message && <p role="status">{message}</p>}
    {result?.queries.map(value => <div key={value} className="catalog-query"><span>{value}</span>{onQuery && <button type="button" disabled={disabled} onClick={() => onQuery(value)}>用此名称查找</button>}</div>)}
    {result?.links.map(item => <a key={item.url} href={safePublicLink(item.url)} target="_blank" rel="noreferrer"><strong>{item.title.slice(0, 200)}</strong><small>{item.snippet.slice(0, 300)}</small><span>{new URL(item.url).hostname} ↗</span></a>)}
  </details>
}
