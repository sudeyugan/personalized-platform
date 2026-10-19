import { useEffect } from 'react'
import { startDeviceSync, syncNow } from './runtime'

export function useDeviceSyncRuntime(ready: boolean) {
  useEffect(() => {
    if (!ready) return
    let disposed = false
    void startDeviceSync().then(() => { if (!disposed) void syncNow() })
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void syncNow() }, 15_000)
    const resume = () => { void syncNow() }
    window.addEventListener('online', resume)
    window.addEventListener('focus', resume)
    return () => { disposed = true; clearInterval(timer); window.removeEventListener('online', resume); window.removeEventListener('focus', resume) }
  }, [ready])
}
