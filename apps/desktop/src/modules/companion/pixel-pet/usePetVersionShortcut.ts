import { isTauri } from '@tauri-apps/api/core'
import { register, unregister } from '@tauri-apps/plugin-global-shortcut'
import { useEffect, useState } from 'react'
import { useLibraryStore } from '../../../state/useLibraryStore'
import { PET_VERSION_REBIND, PET_VERSION_SHORTCUT, PET_VERSION_STATUS } from './petShortcutKeys'

let registrationQueue: Promise<unknown> = Promise.resolve()
function report(message: string) {
  localStorage.setItem(PET_VERSION_STATUS, message)
  window.dispatchEvent(new CustomEvent(PET_VERSION_STATUS, { detail: message }))
}
export function usePetVersionShortcut(visibility: string, quiet: string, emergency: string) {
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const retry = () => setRevision(value => value + 1)
    window.addEventListener(PET_VERSION_REBIND, retry)
    return () => window.removeEventListener(PET_VERSION_REBIND, retry)
  }, [])
  useEffect(() => {
    if (!isTauri()) return
    let disposed = false, registered = false, held = false
    report('正在绑定 Ctrl+Alt+A…')
    registrationQueue = registrationQueue.catch(() => undefined).then(async () => {
      if (disposed) return
      try {
        await register(PET_VERSION_SHORTCUT, event => {
          if (disposed) return
          if (event.state !== 'Pressed') { held = false; return }
          if (held) return
          held = true
          const store = useLibraryStore.getState(), desktop = store.data.companion.desktop
          // Do not replace another selected art style or grant camera consent.
          if (!desktop.pixelPetEnabled || desktop.pixelPetStyle !== 'pixel') {
            report('Ctrl+Alt+A：请先启用像素半身桌宠，再切换两个版本。')
            return
          }
          store.setCompanionPixelEnhancements({ enabled: !desktop.pixelEnhancements?.enabled })
          report('Ctrl+Alt+A 已启用：原版 ↔ 2.0 追踪版。')
        })
        registered = true
        if (!disposed) report('Ctrl+Alt+A 已启用：原版 ↔ 2.0 追踪版。')
      } catch {
        if (!disposed) report('Ctrl+Alt+A 未能绑定，可能被其他程序占用。可在这里重试。')
      }
    })
    return () => {
      disposed = true
      registrationQueue = registrationQueue.catch(() => undefined).then(async () => {
        if (registered) await unregister(PET_VERSION_SHORTCUT).catch(() => undefined)
      })
    }
  }, [visibility, quiet, emergency, revision])
}
