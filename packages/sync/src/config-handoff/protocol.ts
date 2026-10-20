import { decode, encode } from '../crypto'

export type ConfigScope = 'model' | 'voice'
export interface PublicConfig {
  /** Local-only native change marker; never sent to the relay. */
  revision?: string
  model?: { model: 'deepseek-chat' | 'deepseek-reasoner' }
  voice?: { voice: string; sttModel: string; ttsModel: string }
}
export interface ConfigRequest {
  v: 1
  id: string
  space: string
  target: string
  name: string
  publicKey: string
  scopes: ConfigScope[]
  follow: boolean
  expires: number
}
export interface ConfigPacket {
  source: string
  sequence: number
  ephemeral: string
  iv: string
  body: string
}
export interface Signed<T> {
  value: T
  mac: string
}
export interface ConfigChannel {
  request: Signed<ConfigRequest>
  source: string | null
  packet: Signed<ConfigPacket> | null
  acknowledged: number
}
export function publicScope(config: PublicConfig, scope: ConfigScope) {
  return scope === 'model'
    ? config.model?.model
    : config.voice
      ? [config.voice.voice, config.voice.sttModel, config.voice.ttsModel].join('|')
      : undefined
}
export function validateRequest(value: ConfigRequest) {
  if (
    value?.v !== 1 ||
    Object.keys(value).sort().join(',') !==
      'expires,follow,id,name,publicKey,scopes,space,target,v' ||
    ![value.id, value.space, value.target].every((id) => /^[a-f0-9-]{36}$/.test(id)) ||
    typeof value.name !== 'string' ||
    value.name.length > 60 ||
    typeof value.publicKey !== 'string' ||
    !/^[A-Za-z0-9+/]{120,160}={0,2}$/.test(value.publicKey) ||
    !Array.isArray(value.scopes) ||
    value.scopes.length < 1 ||
    value.scopes.length > 2 ||
    value.scopes.some((scope) => !['model', 'voice'].includes(scope)) ||
    new Set(value.scopes).size !== value.scopes.length ||
    typeof value.follow !== 'boolean' ||
    !Number.isSafeInteger(value.expires)
  )
    throw new Error('配置请求格式无效。')
}
export function validatePacket(value: ConfigPacket) {
  if (
    !/^[a-f0-9-]{36}$/.test(value?.source) ||
    Object.keys(value).sort().join(',') !== 'body,ephemeral,iv,sequence,source' ||
    !Number.isSafeInteger(value.sequence) ||
    value.sequence < 1 ||
    !/^[A-Za-z0-9+/]{120,160}={0,2}$/.test(value.ephemeral) ||
    !/^[A-Za-z0-9+/]{16}$/.test(value.iv) ||
    typeof value.body !== 'string' ||
    value.body.length > 12000 ||
    value.body.length < 24 ||
    !/^[A-Za-z0-9+/]+=*$/.test(value.body)
  )
    throw new Error('配置密文格式无效。')
}
// Fixed-array encoding avoids object property-order and native JSON escaping differences.
export function configContext(request: ConfigRequest, source: string, sequence: number) {
  return JSON.stringify([
    1,
    request.space,
    request.id,
    source,
    request.target,
    sequence,
    request.scopes,
    request.publicKey,
  ])
}
function material<T>(purpose: string, value: T) {
  return new TextEncoder().encode(JSON.stringify(['yiyu-config-v1', purpose, value]))
}
async function authKey(key: string) {
  const raw = decode(key)
  if (raw.length !== 32) throw new Error('配置认证密钥无效。')
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ])
}
export async function signConfig<T>(purpose: string, value: T, key: string): Promise<Signed<T>> {
  return {
    value,
    mac: encode(
      new Uint8Array(
        await crypto.subtle.sign('HMAC', await authKey(key), material(purpose, value)),
      ),
    ),
  }
}
export async function verifyConfig<T>(purpose: string, signed: Signed<T>, key: string): Promise<T> {
  if (
    !signed ||
    Object.keys(signed).sort().join(',') !== 'mac,value' ||
    typeof signed.mac !== 'string' ||
    signed.mac.length > 48 ||
    !(await crypto.subtle.verify(
      'HMAC',
      await authKey(key),
      decode(signed.mac),
      material(purpose, signed.value),
    ))
  )
    throw new Error('配置交接校验失败；没有应用设置。')
  return signed.value
}
export async function requestCode(request: ConfigRequest) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', material('request', request)))
  return Array.from(digest.slice(0, 6), (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .match(/.{4}/g)!
    .join(' · ')
}
