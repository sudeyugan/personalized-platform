import { useEffect } from 'react'
import { emitTo } from '@tauri-apps/api/event'
import { useHeartRateStore, visibleHeartRate } from './heartRate'

export function HeartRateRuntime() {
  const enabled = useHeartRateStore((store) => store.enabled)
  const status = useHeartRateStore((store) => store.status)
  useEffect(() => {
    if (!enabled) return
    let disposed = false
    let timer: number | undefined
    const poll = async () => {
      await useHeartRateStore.getState().refresh()
      if (!disposed) timer = window.setTimeout(() => void poll(), 1000)
    }
    void poll()
    return () => { disposed = true; window.clearTimeout(timer) }
  }, [enabled])
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return
    // 不进入 LibraryData、Agent Context、审计、文件或网络；不发送设备名称/地址。
    void emitTo('companion', 'companion:heart-rate', { enabled, phase: status.phase, bpm: visibleHeartRate({ enabled, ...status }), ageMs: status.ageMs })
  }, [enabled, status])
  useEffect(() => {
    const clear = () => { if ('__TAURI_INTERNALS__' in window) void useHeartRateStore.getState().disconnect() }
    window.addEventListener('beforeunload', clear)
    return () => { window.removeEventListener('beforeunload', clear); clear() }
  }, [])
  return null
}
