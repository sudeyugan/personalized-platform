import { type Envelope, type Operation, MAX_RECORD_BYTES, validateOperation } from './types'

export function encode(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, n => String.fromCharCode(n)).join(''))
}
export function decode(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), c => c.charCodeAt(0))
}
export function createKey(): string { return encode(crypto.getRandomValues(new Uint8Array(32))) }
async function importKey(key: string) {
  const raw = decode(key)
  if (raw.length !== 32) throw new Error('同步密钥不正确。')
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}
function aad(space: string, id: string, device: string) {
  return new TextEncoder().encode(JSON.stringify([1, space, id, device]))
}
export async function seal(operation: Operation, key: string, space: string): Promise<Envelope> {
  validateOperation(operation)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const body = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(space, operation.id, operation.device) }, await importKey(key), new TextEncoder().encode(JSON.stringify(operation)))
  return { id: operation.id, device: operation.device, iv: encode(iv), body: encode(new Uint8Array(body)) }
}
export async function open(envelope: Envelope, key: string, space: string): Promise<Operation> {
  if (typeof envelope?.body !== 'string' || envelope.body.length > (MAX_RECORD_BYTES + 16) * 4 / 3 + 4 || decode(envelope.iv).length !== 12) throw new Error('密文格式或大小不支持。')
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(envelope.iv), additionalData: aad(space, envelope.id, envelope.device) }, await importKey(key), decode(envelope.body))
  const operation = JSON.parse(new TextDecoder().decode(decrypted)) as Operation
  validateOperation(operation)
  if (operation.id !== envelope.id || operation.device !== envelope.device) throw new Error('同步记录身份不匹配。')
  return operation
}
