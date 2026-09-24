import { invoke } from '@tauri-apps/api/core'

export interface WebSearchResult {
  title: string
  snippet: string
  url: string
}

const isTauriRuntime = () => '__TAURI_INTERNALS__' in window

export async function searchWeb(query: string): Promise<WebSearchResult[]> {
  const clean = query.trim()
  if (!clean || [...clean].length > 200) throw new Error('联网查询词不能为空且不能超过 200 字')
  if (!isTauriRuntime()) throw new Error('联网查询仅在桌面应用中可用')
  try {
    return await invoke<WebSearchResult[]>('web_search', { query: clean })
  } catch (error) {
    const message = typeof error === 'string' ? error : error instanceof Error ? error.message : 'WEB_SEARCH_UNKNOWN'
    throw new Error(message.startsWith('WEB_SEARCH_') ? message.slice(0, 400) : 'WEB_SEARCH_UNKNOWN')
  }
}
