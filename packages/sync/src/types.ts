export const SYNC_VERSION = 1
export const MAX_RECORD_BYTES = 512_000
export const collections = [
  'works',
  'chapters',
  'volumes',
  'people',
  'places',
  'events',
  'relations',
  'links',
  'todos',
  'assignments',
  'diary',
  'moods',
  'courses',
  'calendar',
  'questions',
  'experiences',
  'ideas',
  'chat',
] as const
export type Collection = (typeof collections)[number]
export type Records = Record<string, Record<string, unknown>>
export interface Operation {
  v: 1
  id: string
  device: string
  key: string
  parents: string[]
  value: Record<string, unknown> | null
  at: string
}
export interface Envelope {
  id: string
  device: string
  iv: string
  body: string
}
export interface SyncConfig {
  url: string
  space: string
  key: string
  device: string
  token: string
  name: string
  recovery?: string
  libraryScope?: string
}
export interface SyncState {
  v: 1
  config: SyncConfig
  cursor: number
  operations: Operation[]
  pending: Envelope[]
  baseline: Records
  selected: Record<string, string>
}
export interface Exchange {
  space: string
  cursor: number
  more: boolean
  entries: { seq: number; envelope: Envelope }[]
}
export interface Pairing {
  v: 1
  url: string
  space: string
  key: string
  invite: string
}
export interface Enrollment {
  url: string
  credential: string
  key: string
  device: string
  token: string
}
export type Transport = (
  url: string,
  path: string,
  token: string,
  body: unknown,
) => Promise<unknown>
export function stableJson(value: unknown): string {
  return (
    JSON.stringify(value, (_key, item) =>
      item && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(
            Object.keys(item)
              .sort()
              .map((key) => [key, item[key]]),
          )
        : item,
    ) ?? 'undefined'
  )
}
export function validKey(key: string): boolean {
  const split = key.indexOf('/')
  return (
    collections.includes(key.slice(0, split) as Collection) &&
    /^[a-zA-Z0-9_.:@-]{1,180}$/.test(key.slice(split + 1))
  )
}
export function validateOperation(value: Operation): void {
  if (
    value?.v !== 1 ||
    !/^[a-f0-9-]{36}$/.test(value.id) ||
    !/^[a-f0-9-]{36}$/.test(value.device) ||
    !validKey(value.key) ||
    !Array.isArray(value.parents) ||
    value.parents.length > 100 ||
    value.parents.some((id) => !/^[a-f0-9-]{36}$/.test(id) || id === value.id) ||
    (value.value !== null &&
      (!value.value || typeof value.value !== 'object' || Array.isArray(value.value))) ||
    typeof value.at !== 'string' ||
    new TextEncoder().encode(JSON.stringify(value)).length > MAX_RECORD_BYTES
  )
    throw new Error('同步记录格式或大小不受支持（单条限512KB）；未应用到资料库。')
}
