import { isTauri } from '@tauri-apps/api/core'
import { register, unregister } from '@tauri-apps/plugin-global-shortcut'
import { useEffect, useState } from 'react'
import { useLibraryStore } from '../../../state/useLibraryStore'

export const PET_MODE_SHORTCUT = 'Control+Alt+Q'
export const PET_MODE_STATUS = 'yiyu:pet-mode-shortcut-status'
export const PET_MODE_REBIND = 'yiyu:pet-mode-shortcut-rebind'
let registrationQueue: Promise<unknown> = Promise.resolve()

export function isPetModeShortcut(value: string) {
  const keys = value.toLowerCase().split('+').map((key) => key.trim().replace(/^(commandorcontrol|ctrl)$/, 'control')).sort()
  return keys.join('+') === 'alt+control+q'
}
function report(message: string) {
  window.localStorage.setItem(PET_MODE_STATUS, message)
  window.dispatchEvent(new CustomEvent(PET_MODE_STATUS, { detail: message }))
}

export function usePetModeShortcut(visibility: string, quiet: string, emergency: string, onSwitch: (pixel: boolean) => void) {
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const retry = () => setRevision(value => value + 1)
    window.addEventListener(PET_MODE_REBIND, retry)
    return () => window.removeEventListener(PET_MODE_REBIND, retry)
  }, [])
  useEffect(() => {
    if (!isTauri()) return
    // Q is reserved for renderer switching; other registrations skip this combination.
    report('正在绑定 Ctrl+Alt+Q…')
    let disposed = false, registered = false, held = false
    // Serialize teardown/setup, including StrictMode and late native registration.
    registrationQueue = registrationQueue.catch(() => undefined).then(async () => {
      if (disposed) return
      try {
        await register(PET_MODE_SHORTCUT, (event) => {
          if (disposed) return
          if (event.state !== 'Pressed') { held = false; return }
          if (held) return
          held = true
          const store = useLibraryStore.getState()
          const pixel = !store.data.companion.desktop.pixelPetEnabled
          store.setCompanionPixelPet(pixel)
          if (!useLibraryStore.getState().data.companion.desktop.visible) useLibraryStore.getState().setCompanionDesktop(true)
          onSwitch(pixel)
        })
        registered = true
        if (!disposed) report('Ctrl+Alt+Q 已启用：桌宠 ↔ WebM / 原角色。')
      } catch (error) {
        if (!disposed) report(error instanceof Error ? `Ctrl+Alt+Q 注册失败：${error.message}` : 'Ctrl+Alt+Q 注册失败，可能被其他程序占用。')
      }
    })
    return () => {
      disposed = true
      registrationQueue = registrationQueue.catch(() => undefined).then(async () => {
        if (registered) await unregister(PET_MODE_SHORTCUT).catch(() => undefined)
      })
    }
  }, [visibility, quiet, emergency, onSwitch, revision])
}
