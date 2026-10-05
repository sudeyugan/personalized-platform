import { invoke } from '@tauri-apps/api/core'
import { create } from 'zustand'

import { emptyHeartRate, type HeartRateStatus } from './display'
export { emptyHeartRate, visibleHeartRate } from './display'
export type { HeartRateStatus, HeartRateDisplay } from './display'

interface HeartRateStore {
  enabled: boolean
  status: HeartRateStatus
  revision: number
  scan: () => Promise<void>
  connect: (deviceId: string) => Promise<void>
  disconnect: () => Promise<void>
  refresh: () => Promise<void>
}

const native = () => '__TAURI_INTERNALS__' in window

export const useHeartRateStore = create<HeartRateStore>((set, get) => {
  const request = async (command: string, args?: Record<string, unknown>) => {
    const revision = get().revision + 1
    set({ revision })
    try {
      if (!native()) throw new Error('浏览器预览不支持蓝牙，请运行 Windows 桌面版。')
      const status = await invoke<HeartRateStatus>(command, args)
      if (get().revision === revision) set({ status })
    } catch (error) {
      if (get().revision === revision) set({ status: { ...emptyHeartRate, phase: 'error', message: String(error).replace(/^Error: /, '') } })
    }
  }
  return {
    enabled: false, status: emptyHeartRate, revision: 0,
    scan: async () => {
      set({ enabled: true, status: { ...emptyHeartRate, phase: 'scanning', message: '正在查找心率广播…' } })
      await request('heart_rate_scan')
    },
    connect: async (deviceId) => {
      set({ status: { ...get().status, phase: 'connecting', bpm: null, ageMs: null, message: '正在连接…' } })
      await request('heart_rate_connect', { deviceId })
    },
    disconnect: async () => {
      set({ enabled: false, status: emptyHeartRate })
      await request('heart_rate_disconnect')
      // 关闭失败也绝不展示旧数据。
      if (!get().enabled) set({ status: emptyHeartRate })
    },
    refresh: async () => {
      if (!native() || !get().enabled) return
      const revision = get().revision
      try {
        const status = await invoke<HeartRateStatus>('heart_rate_status')
        if (get().enabled && get().revision === revision) set({ status })
      } catch {
        if (get().enabled && get().revision === revision) set({ status: { ...emptyHeartRate, phase: 'error', message: '无法读取心率状态，请重新连接。' } })
      }
    },
  }
})
