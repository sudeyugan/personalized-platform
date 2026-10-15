import { useLibraryStore } from '../../state/useLibraryStore'
import { browserOrigin } from '../../domain/browser'
import { browserConnectionEnabled } from './authority'
import { browserNative, configureBrowser, type BrowserConnectionStatus } from './native'

export async function connectBrowserSites(sites:string[],openOrigin?:string) {
  const current=useLibraryStore.getState().data.companion.browser
  if(!sites.length||sites.some(site=>browserOrigin(site)!==site||!current?.sites.includes(site))||openOrigin&&!sites.includes(openOrigin))throw new Error('只能连接本次明确添加的网站')
  if(!browserConnectionEnabled())throw new Error('网站已保存；请先开启浏览器连接和网站访问权限，再点击网站旁的连接')
  const signature=JSON.stringify(current)
  await configureBrowser(true,current!.sites,false,current!.cachedLoginSites??[],current!.interactionSites??[])
  if(signature!==JSON.stringify(useLibraryStore.getState().data.companion.browser)||!browserConnectionEnabled())throw new Error('设置已变化，本次连接已停止')
  return browserNative<BrowserConnectionStatus>('browser_bridge_setup',{sites,openOrigin:openOrigin??null})
}
