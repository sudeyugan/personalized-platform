// Actual browser HTTPS requests/redirects to an ephemeral loopback server.
// Public hostnames are mapped only in this fixture; no account or external HTTP.
import assert from 'node:assert/strict'
import { createServer } from 'node:https'
import { readFile,mkdtemp,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { BrowserEngine } from '../apps/desktop/browser-runtime/engine.mjs'
const require=createRequire(new URL('../apps/desktop/package.json',import.meta.url)),{chromium}=require('playwright-core')
const root=await mkdtemp(join(tmpdir(),'yiyu-login-redirects-')),site='https://www.example.com'
let posts=0,foreign=0,rejectedPosts=0
const server=createServer({key:await readFile(process.argv[2]),cert:await readFile(process.argv[3])},(request,response)=>{
  request.resume()
  if(request.headers.host!=='www.example.com'){foreign++;response.end('unexpected foreign dispatch');return}
  if(request.url==='/session'){posts++;response.writeHead(302,{location:'/inbox'});response.end();return}
  if(request.url==='/redirect-post'){rejectedPosts++;response.writeHead(307,{location:'https://www.iana.org/collect'});response.end();return}
  response.setHeader('content-type','text/html; charset=utf-8')
  if(request.url==='/inbox'){response.end('<h1>虚构收件箱</h1><p>未读邮件 2</p>');return}
  const action=['/unsafe','/unsafe-xhr'].includes(request.url)?'/redirect-post':'/session'
  const submit=request.url==='/unsafe-xhr'?"event.preventDefault();if(event.isTrusted)fetch('/redirect-post',{method:'POST',body:new FormData(this)}).catch(()=>{})":"if(!event.isTrusted)event.preventDefault()"
  response.end(`<form method="post" action="${action}" onsubmit="${submit}"><input required type="text" value="FICTIONAL-ACCOUNT"><input required type="password" value="FICTIONAL-SECRET"><button>登录</button></form>`)
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const port=server.address().port
const engine=new BrowserEngine(join(root,'profile'),options=>chromium.launchPersistentContext(join(root,'profile'),{
  ...options,ignoreHTTPSErrors:true,args:[`--host-resolver-rules=MAP www.example.com 127.0.0.1:${port}, MAP www.iana.org 127.0.0.1:${port}`,'--no-proxy-server'],
}))
try{
  await engine.configure({sites:[site],interactions:[],logins:[site]})
  const [tab]=await engine.request({kind:'ensure',origin:site})
  const blocked=await engine.request({kind:'observe',origin:site,tabId:tab.tabId})
  assert.equal(blocked.loginState,'managed_login');assert.equal(posts,0)
  const result=await engine.request({kind:'observe',origin:site,tabId:tab.tabId,cachedLogin:true})
  assert.equal(posts,1);assert.equal(result.loginState,'continued');assert.match(result.text,/未读邮件 2/)
  assert.doesNotMatch(JSON.stringify(result),/FICTIONAL-ACCOUNT|FICTIONAL-SECRET/)
  await engine.close()
  const [unsafe]=await engine.request({kind:'ensure',origin:site,targetUrl:site+'/unsafe'})
  let denied
  try{denied=await engine.request({kind:'observe',origin:site,tabId:unsafe.tabId,cachedLogin:true})}
  catch(error){assert.match(error.message,/^BROWSER_(?:TAB_CHANGED|PAGE_PENDING)$/)}
  if(denied)assert.notEqual(denied.loginState,'continued')
  assert.equal(rejectedPosts,1);assert.equal(foreign,0)
  await engine.close()
  const [xhr]=await engine.request({kind:'ensure',origin:site,targetUrl:site+'/unsafe-xhr'})
  const xhrResult=await engine.request({kind:'observe',origin:site,tabId:xhr.tabId,cachedLogin:true})
  assert.equal(xhrResult.loginState,'managed_pending');assert.equal(rejectedPosts,2);assert.equal(foreign,0)
  console.log(JSON.stringify({fixture:'managed-login-real-https',realEdge:true,syntheticAccount:true,loopbackTransportOnly:true,productionNetworkPolicy:true,unapprovedPostCount:0,trustedLoginPostCount:posts,sameOrigin302Verified:true,crossOrigin307PostBlocked:true,crossOrigin307XhrBlocked:true,credentialsNotReturned:true}))
}finally{await engine.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true})}
