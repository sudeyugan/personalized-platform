import { invoke } from '@tauri-apps/api/core'

export type WebSearchProviderId = 'tencent' | 'bocha' | 'bing'
export interface WebSearchConfig { providerId: WebSearchProviderId; fallbackToBing: boolean }

export interface WebSearchResult {
  title: string
  snippet: string
  url: string
  provider: 'tencent' | 'bocha' | 'bing-fallback'
}

const isTauriRuntime = () => '__TAURI_INTERNALS__' in window

export async function searchWeb(query: string, config: WebSearchConfig): Promise<WebSearchResult[]> {
  const clean = query.trim()
  if (!clean || [...clean].length > 200) throw new Error('联网查询词不能为空且不能超过 200 字')
  if (!isTauriRuntime()) throw new Error('联网查询仅在桌面应用中可用')
  try {
    return await invoke<WebSearchResult[]>('web_search', { query: clean, provider: config.providerId, fallbackToBing: config.fallbackToBing })
  } catch (error) {
    const message = typeof error === 'string' ? error : error instanceof Error ? error.message : 'WEB_SEARCH_UNKNOWN'
    throw new Error(message.startsWith('WEB_SEARCH_') ? message.slice(0, 400) : 'WEB_SEARCH_UNKNOWN')
  }
}

const secretId = (provider: Exclude<WebSearchProviderId, 'bing'>) => `web-search-${provider}`

export async function storeWebSearchKey(provider: Exclude<WebSearchProviderId, 'bing'>, secret: string) {
  if (isTauriRuntime()) await invoke('store_secret', { id: secretId(provider), secret })
  else sessionStorage.setItem(`yiyu.web-search.${provider}`, secret)
}

export async function hasWebSearchKey(provider: Exclude<WebSearchProviderId, 'bing'>) {
  return isTauriRuntime() ? invoke<boolean>('has_secret', { id: secretId(provider) }) : Boolean(sessionStorage.getItem(`yiyu.web-search.${provider}`))
}

export async function deleteWebSearchKey(provider: Exclude<WebSearchProviderId, 'bing'>) {
  if (isTauriRuntime()) await invoke('delete_secret', { id: secretId(provider) })
  else sessionStorage.removeItem(`yiyu.web-search.${provider}`)
}
