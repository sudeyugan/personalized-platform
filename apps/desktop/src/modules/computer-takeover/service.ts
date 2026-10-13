import { invoke } from '@tauri-apps/api/core'
import type { CompanionComputerSettings } from '../../domain/models'
import type { TakeoverAction, TakeoverObservation } from './types'

export type NativeTakeoverRequest = { action: 'begin'; windowId: string; mode: 'read' | 'control' } | { action: 'observe' | 'end'; sessionId: string } | ({ action: 'act'; sessionId: string; revision: number } & TakeoverAction)
export async function takeoverNative<T>(request: NativeTakeoverRequest, policy: CompanionComputerSettings, confirmed = false): Promise<T> {
  if (!('__TAURI_INTERNALS__' in window)) throw new Error('电脑接管仅在 Windows 桌面版可用')
  return invoke<T>('computer_takeover', { request, policy, confirmed })
}
export interface TakeoverNative {
  begin(windowId: string, mode: 'read' | 'control'): Promise<string>
  observe(sessionId: string): Promise<TakeoverObservation>
  act(sessionId: string, revision: number, action: TakeoverAction, confirmed: boolean): Promise<{ verified: boolean }>
  end(sessionId: string): Promise<void>
}
