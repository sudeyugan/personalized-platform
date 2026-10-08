import { invoke } from '@tauri-apps/api/core'
import { create } from 'zustand'
import { emptyHeartRate, type HeartRateStatus } from './display'
import { readConnectionPreferences, saveConnectionPreferences, normalizeConnectionPreferences, nextHeartRetry, type HeartConnectionPreferences, type RememberedHeartDevice } from './connectionPreferences'
export { emptyHeartRate, visibleHeartRate } from './display'
export type { HeartRateStatus, HeartRateDisplay } from './display'

interface HeartRateStore {
  enabled: boolean; status: HeartRateStatus; revision: number
  preferences: HeartConnectionPreferences; preferencesSaved: boolean; initialized: boolean
  reconnectTarget: string | null; pendingDevice: RememberedHeartDevice | null; retryAt: number | null; retryAttempt: number
  enable: () => Promise<void>; scan: () => Promise<void>; reconnect: () => Promise<void>
  connect: (deviceId: string) => Promise<void>; disconnect: () => Promise<void>; refresh: () => Promise<void>
  setAutoConnect: (enabled: boolean) => void; forgetDevice: () => Promise<void>; resumeOnStartup: () => Promise<void>
}
const native = () => '__TAURI_INTERNALS__' in window
const busy = (status: HeartRateStatus) => ['scanning', 'connecting', 'connected'].includes(status.phase)

export const useHeartRateStore = create<HeartRateStore>((set, get) => {
  let polling = false
  let requests = 0
  const savePreferences = (preferences: HeartConnectionPreferences) => {
    set({ preferences, preferencesSaved: saveConnectionPreferences(preferences) })
  }
  const request = async (command: string, args?: Record<string, unknown>) => {
    const revision = get().revision + 1
    set({ revision })
    requests++
    try {
      if (!native()) throw new Error('浏览器预览不支持蓝牙，请运行 Windows 桌面版。')
      const status = await invoke<HeartRateStatus>(command, args)
      if (get().revision === revision) set({ status })
    } catch (error) {
      if (get().revision === revision) set({ status: { ...emptyHeartRate, phase: 'error', message: String(error).replace(/^Error: /, '') } })
    } finally { requests-- }
  }
  const startReconnect = async (retry = false) => {
    if (busy(get().status)) return
    const device = get().preferences.device
    if (!device) { await get().scan(); return }
    set({ enabled: true, reconnectTarget: device.id, pendingDevice: null, retryAt: null,
      retryAttempt: retry ? get().retryAttempt + 1 : 1,
      status: { ...emptyHeartRate, phase: 'scanning', message: `正在寻找 ${device.name} 的心率广播…` } })
    await request('heart_rate_scan')
  }
  const scheduleRetry = () => {
    const { preferences, retryAttempt } = get()
    set({ retryAt: preferences.autoConnect && preferences.device ? nextHeartRetry(retryAttempt || 1, Date.now()) : null })
  }
  return {
    enabled: false, status: emptyHeartRate, revision: 0, preferences: readConnectionPreferences(), preferencesSaved: true,
    initialized: false, reconnectTarget: null, pendingDevice: null, retryAt: null, retryAttempt: 0,
    enable: async () => { if (!get().enabled) await (get().preferences.device ? get().reconnect() : get().scan()) },
    reconnect: () => startReconnect(),
    scan: async () => {
      if (busy(get().status)) return
      set({ enabled: true, reconnectTarget: null, pendingDevice: null, retryAt: null, retryAttempt: 3,
        status: { ...emptyHeartRate, phase: 'scanning', message: '正在查找心率广播…' } })
      await request('heart_rate_scan')
    },
    connect: async (deviceId) => {
      if (!get().enabled || busy(get().status)) return
      const device = get().status.devices.find((item) => item.id === deviceId)
      if (!device) return
      set({ pendingDevice: device, reconnectTarget: null, retryAt: null,
        retryAttempt: device.id === get().preferences.device?.id ? get().retryAttempt : 3,
        status: { ...get().status, phase: 'connecting', bpm: null, ageMs: null, message: '正在连接…' } })
      await request('heart_rate_connect', { deviceId })
    },
    disconnect: async () => {
      set({ enabled: false, status: emptyHeartRate, reconnectTarget: null, pendingDevice: null, retryAt: null, retryAttempt: 0 })
      await request('heart_rate_disconnect')
      if (!get().enabled) set({ status: emptyHeartRate })
    },
    setAutoConnect: (enabled) => {
      if (!get().preferences.device) return
      savePreferences({ ...get().preferences, autoConnect: enabled })
      if (!enabled) set({ retryAt: null })
    },
    forgetDevice: async () => {
      savePreferences({ version: 1, device: null, autoConnect: false })
      await get().disconnect()
    },
    resumeOnStartup: async () => {
      if (get().initialized) return
      set({ initialized: true })
      if (native() && get().preferences.autoConnect && get().preferences.device && !get().enabled) await startReconnect()
    },
    refresh: async () => {
      if (!native() || !get().enabled || polling || requests > 0) return
      polling = true
      const revision = get().revision
      try {
        const status = await invoke<HeartRateStatus>('heart_rate_status')
        if (!get().enabled || get().revision !== revision) return
        set({ status })
        if (status.phase === 'connected') {
          const device = get().pendingDevice
          if (device) savePreferences(normalizeConnectionPreferences({ version: 1, device, autoConnect: get().preferences.autoConnect }))
          set({ pendingDevice: null, reconnectTarget: null, retryAt: null, retryAttempt: 0 })
          return
        }
        if (get().reconnectTarget && status.phase === 'idle') {
          const device = status.devices.find((item) => item.id === get().reconnectTarget)
          if (device) { await get().connect(device.id); return }
          set({ status: { ...status, message: '未找到已记住的手表，请开启广播后重新连接；标识变化时请重新选择设备。' } })
          if (get().retryAt === null && get().retryAttempt < 3) scheduleRetry()
        } else if (status.phase === 'error') {
          set({ pendingDevice: null, reconnectTarget: null })
          if (get().retryAt === null && get().retryAttempt < 3) scheduleRetry()
        }
      } catch {
        if (get().enabled && get().revision === revision) {
          set({ status: { ...emptyHeartRate, phase: 'error', message: '无法读取心率状态，请重新连接。' } })
          if (get().retryAt === null && get().retryAttempt < 3) scheduleRetry()
        }
      } finally { polling = false }
      if (get().enabled && get().revision === revision && get().retryAt !== null && Date.now() >= get().retryAt! && !busy(get().status)) await startReconnect(true)
    },
  }
})
