import { useLibraryStore } from '../../../state/useLibraryStore'
import { browserConnectionEnabled } from '../authority'
import { browserNative,type BrowserConnectionStatus } from '../native'
export interface ManagedBrowserStatus extends BrowserConnectionStatus {backend:'managed';mode:'login'|'background'}
let queue=Promise.resolve()
export function configureManagedBrowser(invalidate=false):Promise<ManagedBrowserStatus>{
  const next=queue.catch(()=>undefined).then(async()=>{
    if(invalidate)await browserNative('managed_browser_cancel')
    const settings=useLibraryStore.getState().data.companion.browser
    return browserNative<ManagedBrowserStatus>('managed_browser_configure',{enabled:settings?.backend==='managed'&&browserConnectionEnabled(),sites:settings?.sites??[],interactionSites:settings?.interactionSites??[]})
  })
  queue=next.then(()=>undefined,()=>undefined);return next
}
export function stopManagedBrowser(){return browserNative<void>('managed_browser_cancel')}
