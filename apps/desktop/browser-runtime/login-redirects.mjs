import { networkPolicy } from './policy.mjs'

// Playwright route handlers do not re-run for HTTP redirects. An internal
// response-stage guard checks Location BEFORE the browser can forward a login
// POST (307/308) or navigate elsewhere. No response bodies/credentials are read.
const installed=new WeakMap()
export async function protectLoginRedirects(page,site) {
  if(installed.has(page))return installed.get(page)
  const start=(async()=>{
    const session=await page.context().newCDPSession(page),policy=networkPolicy([site])
    session.on('Fetch.requestPaused',event=>{
      void (async()=>{
        const params={requestId:event.requestId}
        try{
          const location=event.responseHeaders?.find(header=>header.name.toLowerCase()==='location')?.value
          if(event.responseStatusCode>=300&&event.responseStatusCode<400&&location){
            const next=new URL(location,event.request.url).href
            return await policy({
              request:()=>({url:()=>next,isNavigationRequest:()=>event.resourceType==='Document'||!['GET','HEAD','OPTIONS'].includes(event.request.method)}),
              continue:()=>session.send('Fetch.continueResponse',params),
              abort:()=>session.send('Fetch.failRequest',{...params,errorReason:'BlockedByClient'}),
            })
          }
          await session.send('Fetch.continueResponse',params)
        }catch{await session.send('Fetch.failRequest',{...params,errorReason:'BlockedByClient'}).catch(()=>{})}
      })()
    })
    try{await session.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Response'}]})}
    catch(error){await session.detach().catch(()=>{});throw error}
  })()
  installed.set(page,start);return start
}
