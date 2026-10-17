import { invoke } from '@tauri-apps/api/core'
import { browserNativeError } from './nativeError'
import type { BrowserParameterIntent } from './parameters'
export interface BrowserConnectionStatus { enabled: boolean; paired: boolean; online: boolean; sites: string[]; browserSites: string[]; epoch: number; extensionVersion?:string|null; expectedVersion?:string; extensionPath?:string|null; updateRequired?:boolean; setupPending?:boolean }
export interface BrowserInteraction { observationId:string; elementId:string; operation:'invoke'|'search'|'fill'|'select'|'scroll'; query?:string;intent?:BrowserParameterIntent }
export interface BrowserReadRequest { kind: 'tabs' | 'page' | 'followed_live' | 'ensure' | 'observe' | 'act'; origin: string; tabId?: number; cachedLogin?: boolean; targetUrl?:string; interaction?:BrowserInteraction; queryMode?:'background'|'foreground' }
export interface BrowserSnapshot { data: unknown; origin: string; fetchedAtEpochMs: number; untrusted: true; privateBrowser: true; verified: true }
export function browserNative<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!('__TAURI_INTERNALS__' in window)) return Promise.reject(new Error('浏览器连接仅在Windows桌面版可用'))
  return invoke<T>(command, args).catch((reason: unknown) => { throw browserNativeError(reason,command) })
}
let configuration = Promise.resolve()
export function configureBrowser(enabled: boolean, sites: string[], invalidate=false, cachedLoginSites: string[] = [],interactionSites:string[] = []) {
  const next = configuration.catch(() => undefined).then(async () => { if(invalidate)await browserNative('browser_bridge_cancel');return browserNative<BrowserConnectionStatus>('browser_bridge_configure', { enabled, sites, cachedLoginSites,interactionSites }) })
  configuration = next.then(() => undefined, () => undefined)
  return next
}
