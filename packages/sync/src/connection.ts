import { createKey, decode } from './crypto'
import type { Pairing, SyncState, Transport } from './types'
import { loadEnrollment, saveEnrollment } from './storage'

export function serverUrl(raw: string): string {
  const url = new URL(raw.trim())
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))
    || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('中枢地址需为 HTTPS 源地址；HTTP 仅允许本机回环。')
  return url.origin
}
export const fetchTransport: Transport = async (url, path, token, body) => {
  const result = await fetch(`${serverUrl(url)}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(20_000), credentials: 'omit', cache: 'no-store' })
  if (!result.ok) throw new Error(result.status === 401 ? '连接凭证失效或设备已被撤销。' : `中枢暂不可用（${result.status}）；本机资料和待同步内容仍保留。`)
  const reader = result.body?.getReader()
  if (!reader) throw new Error('中枢没有返回响应。')
  const chunks: Uint8Array[] = []; let size = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > 2_900_000) throw new Error('中枢响应超过安全上限。')
      chunks.push(value)
    }
  } finally { await reader.cancel().catch(() => undefined) }
  const bytes = new Uint8Array(size); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return JSON.parse(new TextDecoder().decode(bytes))
}
export function readPairing(raw: string): Pairing {
  const pairing = JSON.parse(raw) as Pairing
  pairing.url = serverUrl(pairing.url)
  if (pairing.v !== 1 || !/^[a-f0-9-]{36}$/.test(pairing.space) || decode(pairing.key).length !== 32 || !/^[a-f0-9]{64}$/.test(pairing.invite)) throw new Error('邀请格式无效。')
  return pairing
}
export async function connect(url: string, credential: string, name: string, transport: Transport, pairing?: Pairing): Promise<SyncState> {
  const draft = await prepareEnrollment(serverUrl(url), credential, pairing?.key)
  const result = await transport(serverUrl(url), '/v1/enroll', credential, { name: name.trim().slice(0, 60) || '我的设备', device: draft.device, token: draft.token }) as { space: string; device: string; token: string }
  if (!/^[a-f0-9-]{36}$/.test(result?.space) || !/^[a-f0-9-]{36}$/.test(result.device) || !/^[a-f0-9]{64}$/.test(result.token)) throw new Error('中枢返回无效设备凭证。')
  if (pairing && pairing.space !== result.space) throw new Error('中枢身份变化，请向原设备重新取得邀请。')
  if (result.device !== draft.device || result.token !== draft.token) throw new Error('设备身份响应不符。')
  return { v: 1, config: { url: serverUrl(url), space: result.space, device: result.device, token: result.token, key: draft.key, name, ...(!pairing ? { recovery: credential } : {}) }, cursor: 0, operations: [], pending: [], baseline: {}, selected: {} }
}
async function prepareEnrollment(url: string, credential: string, key?: string) {
  const existing = await loadEnrollment()
  if (existing && existing.url === url && existing.credential === credential) return existing
  const draft = { url, credential, key: key ?? createKey(), device: crypto.randomUUID(), token: Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('') }
  // Before consuming a one-time invitation, durably save the exact identity/key.
  await saveEnrollment(draft)
  return draft
}
export async function recover(raw: string, name: string, transport: Transport): Promise<SyncState> {
  const value = JSON.parse(raw) as { v: number; url: string; space: string; key: string; recovery: string }
  if (value.v !== 1 || decode(value.key).length !== 32 || !/^[a-f0-9]{64}$/.test(value.recovery) || !/^[a-f0-9-]{36}$/.test(value.space)) throw new Error('恢复包无效。')
  const draft = await prepareEnrollment(serverUrl(value.url), value.recovery, value.key)
  const result = await transport(serverUrl(value.url), '/v1/recover', value.recovery, { space: value.space, name: name.slice(0, 60), device: draft.device, token: draft.token }) as { space: string; device: string; token: string }
  if (result.space !== value.space || !/^[a-f0-9-]{36}$/.test(result.device) || !/^[a-f0-9]{64}$/.test(result.token)) throw new Error('恢复中枢身份不符。')
  if (result.device !== draft.device || result.token !== draft.token) throw new Error('恢复设备身份不符。')
  return { v: 1, config: { url: serverUrl(value.url), key: value.key, space: value.space, recovery: value.recovery, device: result.device, token: result.token, name }, cursor: 0, operations: [], pending: [], baseline: {}, selected: {} }
}
export function recoveryBundle(state: SyncState): string {
  if (!state.config.recovery) throw new Error('只有管理设备能生成恢复包。')
  const { url, space, key, recovery } = state.config
  return JSON.stringify({ v: 1, url, space, key, recovery })
}
export async function invite(state: SyncState, transport: Transport): Promise<string> {
  const result = await transport(state.config.url, '/v1/invites', state.config.token, {}) as { invite: string }
  return JSON.stringify({ v: 1, url: state.config.url, space: state.config.space, key: state.config.key, invite: result.invite } satisfies Pairing)
}
