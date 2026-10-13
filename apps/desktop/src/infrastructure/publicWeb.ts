import { invoke } from '@tauri-apps/api/core'

export interface PublicReadResult {
  url: string
  fetchedAtEpochMs: number
  contentType: string
  cached: boolean
  untrusted: true
  truncated: boolean
  title?: string | null
  text?: string | null
  links: Array<{ text: string; url: string }>
  data?: unknown
}

export interface PublicLiveStatus {
  roomUrl: string
  fetchedAtEpochMs: number
  sourceUrls: string[]
  status: 'live' | 'offline' | 'replay' | 'unknown'
  reason: string
  anchorName?: string | null
  untrusted: true
}

export function publicReadUrl(raw: string) {
  const url = new URL(raw)
  if (raw.length > 2048 || url.protocol !== 'https:' || url.username || url.password || url.port || url.hash
    || !url.hostname.includes('.') || url.hostname.includes(':') || /^[\d.]+$/.test(url.hostname)
    || /(?:\.|^)(?:localhost|local|internal|test|invalid)$/.test(url.hostname)) throw new Error('只支持不带账号、端口或片段的公开HTTPS域名链接')
  for (const key of url.searchParams.keys()) if (/token|secret|password|passwd|authorization|api_?key|access_key|session|cookie|signature|credential/i.test(key)) throw new Error('不读取带认证或会话参数的链接')
  return url.href
}

async function request<T>(command: string, args: Record<string, unknown>) {
  try { return await invoke<T>(command, args) }
  catch (error) { throw new Error(typeof error === 'string' && error.startsWith('PUBLIC_WEB_') ? error.slice(0, 2400) : '公开来源读取未完成') }
}

export async function readPublicWeb(url: string, kind: 'page' | 'json', pointer?: string) {
  return request<PublicReadResult>('public_web_read', { url: publicReadUrl(url), kind, pointer, approved: true })
}

export async function queryPublicLiveStatus(roomUrl: string, expectedName: string) {
  return request<PublicLiveStatus>('public_web_live_status', { roomUrl: publicReadUrl(roomUrl), expectedName, approved: true })
}
