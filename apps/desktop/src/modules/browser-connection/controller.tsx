import { useEffect, useRef } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useLibraryStore } from '../../state/useLibraryStore'
import { browserAccessEnabled } from './authority'
import { browserNative, configureBrowser } from './native'
import { forgetBrowserTurn } from './taskSession'
export function BrowserConnectionController() {
  const ready = useLibraryStore(state => state.ready)
  const authority = useLibraryStore(state => JSON.stringify([state.data.companion.provider, state.data.settings.trust, state.data.companion.permissions.fullAccess, state.data.companion.permissions.internet, state.data.settings.modules.find(item => item.id === 'companion')]))
  const previousAuthority = useRef<string | undefined>(undefined)
  const signature = useLibraryStore(state => JSON.stringify([state.data.companion.browser, state.data.companion.provider, state.data.settings.trust, state.data.companion.permissions.fullAccess, state.data.companion.permissions.internet, state.data.settings.modules.find(item => item.id === 'companion')]))
  useEffect(() => {
    if (!ready || !('__TAURI_INTERNALS__' in window)) return
    const invalidate=previousAuthority.current!==undefined&&previousAuthority.current!==authority
    previousAuthority.current=authority
    // Native configure cancels changed sites/enabled itself. Avoid a duplicate
    // late cancel erasing a setup request just issued by the settings UI.
    const browser = useLibraryStore.getState().data.companion.browser
    forgetBrowserTurn('main');forgetBrowserTurn('desktop')
    void configureBrowser(browserAccessEnabled(), browser?.sites ?? [], invalidate, browser?.cachedLoginSites ?? [],browser?.interactionSites??[]).catch(() => undefined)
  }, [ready, signature, authority])
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return
    let disposed = false, unlisten: (() => void) | undefined
    const stop = () => { void browserNative('browser_bridge_cancel').catch(() => undefined) }
    window.addEventListener('yiyu:computer-stop', stop)
    void listen('computer:emergency-stop', stop).then(off => { if (disposed) off(); else unlisten = off }).catch(() => undefined)
    return () => { disposed = true; unlisten?.(); window.removeEventListener('yiyu:computer-stop', stop); stop() }
  }, [])
  return null
}
