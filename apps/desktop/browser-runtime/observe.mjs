import { randomUUID } from 'node:crypto'
import { describeElement, pageText } from './dom.mjs'

export function safePageUrl(raw, site) {
  const url=new URL(raw)
  if(url.origin!==site || url.protocol!=='https:')throw new Error('BROWSER_TAB_CHANGED')
  // Session/query/fragment identifiers never enter model results or history.
  return `${url.origin}${url.pathname}`.slice(0,2048)
}
export async function observe(page, tabId, site, allowActions) {
  const startedUrl=page.url();safePageUrl(startedUrl,site)
  const title=(await page.title()).slice(0,200), observationId=randomUUID()
  const refs=new Map(), controls=[], links=[], texts=[]
  let truncated=false, login=false, loading=false,remaining=12000
  for (const frame of page.frames().slice(0,8)) {
    if(new URL(frame.url()||'about:blank').origin!==site)continue
    const document=await frame.locator('html').elementHandle()
    if(!document)continue
    const frameUrl=frame.url()
    const result=await frame.evaluate(pageText)
    login ||= result.login;truncated ||= result.truncated;loading ||= result.loading
    texts.push(result.text.slice(0,remaining));remaining-=Math.min(result.text.length,remaining)
    if(remaining<=0){truncated=true;break}
    if(allowActions) {
      const locator=frame.locator('a[href],button,input,select,[role="button"]'),count=Math.min(await locator.count(),300)
      for (let index=0;index<count&&controls.length<59;index++) {
        const handle=await locator.nth(index).elementHandle()
        if(!handle)continue
        const info=await handle.evaluate(describeElement)
        if(!info || controls.length>=59){await handle.dispose();continue}
        const id=randomUUID()
        refs.set(id,{handle,info,url:frame.url(),frame,document})
        controls.push({id,name:(info.options?`${info.name}（${info.options.join('、')}）`:info.name).slice(0,100),operation:info.operation})
        if(info.href && links.length<40) links.push({text:info.name,url:safePageUrl(info.href,site)})
      }
    }
    if(frame.url()!==frameUrl || !await document.evaluate(node=>node===document.documentElement).catch(()=>false))throw new Error('BROWSER_TAB_CHANGED')
    if(![...refs.values()].some(ref=>ref.document===document))await document.dispose()
  }
  if(allowActions&&!login){const id=randomUUID();refs.set(id,{scroll:true});controls.push({id,name:'向下滚动一屏',operation:'scroll'})}
  if(login){for(const ref of refs.values())await ref.handle?.dispose();refs.clear();controls.length=0}
  if(page.url()!==startedUrl)throw new Error('BROWSER_TAB_CHANGED')
  const value={tabId,origin:site,url:safePageUrl(startedUrl,site),title,text:texts.join('\n').slice(0,12000),truncated,loading,observationId,controls,links,...(login?{loginState:'managed_login'}:{})}
  return {value,refs,observationId,url:page.url(),created:Date.now()}
}
export async function release(observation) {
  if(!observation)return
  const documents=new Set()
  for(const ref of observation.refs.values()){await ref.handle?.dispose().catch(()=>{});if(ref.document)documents.add(ref.document)}
  for(const document of documents)await document.dispose().catch(()=>{})
}
