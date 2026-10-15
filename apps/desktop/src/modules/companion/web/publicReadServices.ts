import { publicReadUrl, queryPublicLiveStatus, readPublicWeb, type PublicLiveStatus, type PublicReadResult } from '../../../infrastructure/publicWeb'
import { useLibraryStore } from '../../../state/useLibraryStore'
import { moduleStatus } from '../../../domain/moduleAvailability'
import { protectOutboundText, type PrivacyReviewRequest } from '../../privacy'
import { assertExternalAiAllowed } from '../../trust/trustPolicy'

export interface PublicReadServices {
  readPublicPage?(url: string, confirmed: boolean): Promise<PublicReadResult>
  readPublicJson?(url: string, pointer: string | undefined, confirmed: boolean): Promise<PublicReadResult>
  queryLiveStatus?(roomUrl: string, name: string, confirmed: boolean): Promise<PublicLiveStatus>
}

export function createPublicReadServices(requestReview?: (request: PrivacyReviewRequest) => Promise<boolean>, signal?: AbortSignal): PublicReadServices {
  const authority = (confirmed: boolean) => {
    if (signal?.aborted) throw new Error('已取消公开读取')
    const data = useLibraryStore.getState().data
    const status = moduleStatus(data.settings.modules, 'companion')
    if (!confirmed || (!data.companion.permissions.fullAccess && !data.companion.permissions.internet) || !status.enabled || !status.available) throw new Error('公开读取未授权，或联网/伙伴授权已关闭')
    try { assertExternalAiAllowed(data.companion.provider.providerId, data.settings.trust, 'companion') }
    catch { throw new Error('外部AI处理授权已关闭，公开查询停止') }
    return data.settings.trust
  }
  const protect = async (raw: string, confirmed: boolean, extra?: string) => {
    const url = publicReadUrl(raw)
    const trust = authority(confirmed)
    // URL encodings must not hide dictionary entries or personal identifiers
    // from outbound protection. Inspect the decoded form, but never send it.
    let decoded = url
    try { decoded = decodeURIComponent(url) } catch { throw new Error('链接含无法核对的编码，已停止公开读取') }
    const outgoing = [url, ...(decoded !== url ? [decoded] : []), ...(extra ? [extra] : [])].join('\n')
    const safe = await protectOutboundText(outgoing, {
      trust: { ...trust, outboundProtection: true }, destination: extra ? 'B站匿名公开房间与主播接口' : new URL(url).hostname,
      purpose: '公开HTTPS只读查询；不使用登录、Cookie或本地文件', requestReview,
      authorizeSanitizedQuery:()=>{authority(confirmed)},
    })
    if (safe !== outgoing) throw new Error('目标含需保护的信息，已停止读取；请改用不带私密参数的公开链接或昵称')
    authority(confirmed)
    return url
  }
  const perform = async <T>(raw: string, confirmed: boolean, fetch: (url: string) => Promise<T>, extra?: string) => {
    const url = await protect(raw, confirmed, extra)
    authority(confirmed)
    const result = await fetch(url)
    authority(confirmed)
    return result
  }
  return {
    readPublicPage: (url, confirmed) => perform(url, confirmed, safe => readPublicWeb(safe, 'page')),
    readPublicJson: (url, pointer, confirmed) => perform(url, confirmed, safe => readPublicWeb(safe, 'json', pointer)),
    queryLiveStatus: (roomUrl, name, confirmed) => perform(roomUrl, confirmed, safe => queryPublicLiveStatus(safe, name), name),
  }
}
