// Isolated actual Edge test. Synthetic server responses, not a user's account.
import assert from 'node:assert/strict'
import { mkdtemp,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { BrowserEngine } from '../apps/desktop/browser-runtime/engine.mjs'
const require=createRequire(new URL('../apps/desktop/package.json',import.meta.url)),{chromium}=require('playwright-core')
const root=await mkdtemp(join(tmpdir(),'yiyu-managed-fixture-')),profile=join(root,'profile'),site='https://www.example.com',auth='https://www.iana.org'
let sessionPosts=0,pendingPosts=0
const modes=[],blocked=[],engine=new BrowserEngine(profile,async options=>{
  modes.push({headless:options.headless,sandbox:options.chromiumSandbox})
  const context=await chromium.launchPersistentContext(profile,options),register=context.route.bind(context)
  // Keep the actual engine handler and network policy (including public DNS).
  // Substitute only its final network dispatch with fictional HTTPS responses:
  // unlike a last-registered fulfill handler, this does not bypass the policy.
  context.route=(pattern,handler)=>register(pattern,route=>handler({
    request:()=>route.request(),abort:reason=>{blocked.push(new URL(route.request().url()).origin);return route.abort(reason)},continue:()=>respond(route),
  }))
  return context
})
async function respond(route) {
    const request=route.request(),url=new URL(request.url())
    if(url.origin===auth)return route.fulfill({contentType:'text/html; charset=utf-8',body:`<h1>虚构统一认证</h1><form action="${site}/session" method="post"><label>账号<input name="username" value="FICTIONAL-ACCOUNT"></label><label>密码<input type="password" name="password" value="FICTIONAL-SECRET"></label><button>登录</button></form>`})
    assert.equal(url.origin,site)
    const filled=action=>`<h1>虚构登录</h1><form method="post" action="${action}" onsubmit="if(!event.isTrusted)event.preventDefault()"><input type="text" required value="FICTIONAL-ACCOUNT"><input type="password" required value="FICTIONAL-SECRET"><button>登录</button></form>`
    if(url.pathname==='/auto-login')return route.fulfill({contentType:'text/html; charset=utf-8',body:filled('/session')})
    if(['/auto-pending','/session-pending'].includes(url.pathname)){
      if(request.method()==='POST')pendingPosts++
      return route.fulfill({contentType:'text/html; charset=utf-8',body:filled('/session-pending')})
    }
    const logged=/fixture-session=1/.test(request.headers().cookie??'')
    // A script navigation returns through the policy/transport adapter. Actual
    // HTTP redirects are tested separately against a local HTTPS server.
    if(url.pathname==='/session'){sessionPosts++;return route.fulfill({headers:{'content-type':'text/html; charset=utf-8','set-cookie':'fixture-session=1; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600'},body:'<script>location.replace("/inbox")</script>'})}
    if(!logged)return route.fulfill({contentType:'text/html; charset=utf-8',body:`<script>location.replace('${auth}/fixture-login')</script>`})
    if(url.pathname==='/frame')return route.fulfill({contentType:'text/html; charset=utf-8',body:'<p>未读邮件 2</p><a href="/archive">查看历史</a>'})
    return route.fulfill({contentType:'text/html; charset=utf-8',body:'<h1>虚构收件箱</h1><iframe src="/frame"></iframe><button onclick="document.querySelector(\'h1\').textContent=\'查看未读邮件\'">查看未读</button><button>删除邮件</button><input type="text" aria-label="筛选关键词" value="PRIVATE-INPUT-DO-NOT-READ"><select aria-label="筛选状态"><option>全部</option><option>未读</option></select><form method="get" action="/inbox"><input type="search" name="q" aria-label="搜索邮件"></form><a href="https://other.com">跨站</a>'})
}
function visibleOwnedWindows(){
  if(process.platform!=='win32')return null
  const command='$items=Get-CimInstance Win32_Process -Filter "name=\'msedge.exe\'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($env:YIYU_FIXTURE_PROFILE) }; $n=0; foreach($item in $items){$p=Get-Process -Id $item.ProcessId -ErrorAction SilentlyContinue;if($p -and $p.MainWindowHandle -ne 0){$n++}}; Write-Output $n'
  return Number(execFileSync('powershell.exe',['-NoProfile','-Command',command],{env:{...process.env,YIYU_FIXTURE_PROFILE:profile},encoding:'utf8'}).trim())
}
function verifyOwnedSandbox(){
  if(process.platform!=='win32')return false
  const command='$items=@(Get-CimInstance Win32_Process -Filter "name=\'msedge.exe\'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($env:YIYU_FIXTURE_PROFILE) }); if($items.Count -eq 0){throw "No owned fixture browser"}; foreach($item in $items){if($item.CommandLine.Contains("--no-sandbox")){throw "Owned browser sandbox disabled"}}; Write-Output "sandbox-enabled"'
  assert.equal(execFileSync('powershell.exe',['-NoProfile','-Command',command],{env:{...process.env,YIYU_FIXTURE_PROFILE:profile},encoding:'utf8'}).trim(),'sandbox-enabled')
  return true
}
try {
  await engine.configure({sites:[site],interactions:[site]})
  await engine.login(site,site)
  const loginPage=[...engine.pages.values()][0]
  await loginPage.waitForURL(auth+'/fixture-login')
  await assert.rejects(engine.request({kind:'observe',origin:site,tabId:1}),/LOGIN_ACTIVE/)
  await assert.rejects(engine.request({kind:'tabs',origin:auth}),/PERMISSION/)
  assert.deepEqual(engine.sites,[site])
  const sandboxEnabled=verifyOwnedSandbox()
  const before=await loginPage.locator('input[type=password]').count();assert.equal(before,1)
  const headedWindows=visibleOwnedWindows();if(headedWindows!==null)assert.ok(headedWindows>=1)
  // Explicit fixture-user action, not an agent bypassing credential policy.
  await loginPage.getByRole('button',{name:'登录',exact:true}).click()
  await loginPage.waitForURL(site+'/inbox');await engine.close()
  await engine.request({kind:'tabs',origin:site})
  const [tab]=await engine.request({kind:'ensure',origin:site,targetUrl:site+'/inbox'})
  let observed=await engine.request({kind:'observe',origin:site,tabId:tab.tabId})
  assert.match(observed.text,/未读邮件 2/);assert.equal(observed.loginState,undefined)
  assert.equal(observed.loading,false)
  assert.doesNotMatch(JSON.stringify(observed),/FICTIONAL-SECRET|PRIVATE-INPUT|fixture-session|FICTIONAL-ACCOUNT/)
  assert.ok(!observed.controls.some(control=>/删除|跨站/.test(control.name)))
  const invoke=observed.controls.find(control=>control.name==='查看未读')
  assert.ok(invoke)
  await engine.request({kind:'act',origin:site,tabId:tab.tabId,interaction:{observationId:observed.observationId,elementId:invoke.id,operation:'invoke'}})
  await assert.rejects(engine.request({kind:'act',origin:site,tabId:tab.tabId,interaction:{observationId:observed.observationId,elementId:invoke.id,operation:'invoke'}}),/STALE/)
  observed=await engine.request({kind:'observe',origin:site,tabId:tab.tabId})
  assert.match(observed.text,/查看未读邮件/)
  const select=observed.controls.find(control=>control.operation==='select')
  await engine.request({kind:'act',origin:site,tabId:tab.tabId,interaction:{observationId:observed.observationId,elementId:select.id,operation:'select',query:'未读'}})
  observed=await engine.request({kind:'observe',origin:site,tabId:tab.tabId})
  const search=observed.controls.find(control=>control.operation==='search')
  await engine.request({kind:'act',origin:site,tabId:tab.tabId,interaction:{observationId:observed.observationId,elementId:search.id,operation:'search',query:'申请'}})
  observed=await engine.request({kind:'observe',origin:site,tabId:tab.tabId})
  assert.equal(new URL(observed.url).search,'');assert.match(observed.text,/未读邮件 2/)
  const backgroundWindows=visibleOwnedWindows();if(backgroundWindows!==null)assert.equal(backgroundWindows,0)
  const crossSite=await engine.context.newPage()
  await assert.rejects(crossSite.goto(auth+'/fixture-login',{waitUntil:'domcontentloaded',timeout:10000}),/ERR_BLOCKED_BY_CLIENT/)
  assert.ok(blocked.includes(auth));await crossSite.close()
  await engine.configure({sites:[site],interactions:[site],logins:[site]})
  await engine.request({kind:'tabs',origin:site})
  const automatic=await engine.context.newPage();await automatic.goto(site+'/auto-login')
  const automaticId=[...engine.pages.entries()].find(([,page])=>page===automatic)[0],beforePosts=sessionPosts
  const denied=await engine.request({kind:'observe',origin:site,tabId:automaticId})
  assert.equal(denied.loginState,'managed_login');assert.equal(sessionPosts,beforePosts);assert.equal(denied.text,'')
  const logged=await engine.request({kind:'observe',origin:site,tabId:automaticId,cachedLogin:true})
  assert.equal(sessionPosts,beforePosts+1);assert.equal(logged.loginState,'continued');assert.match(logged.text,/未读邮件 2/)
  assert.doesNotMatch(JSON.stringify(logged),/FICTIONAL-ACCOUNT|FICTIONAL-SECRET|fixture-session/)
  const afterLoginAction=logged.controls.find(control=>control.name==='查看未读')
  assert.ok(afterLoginAction)
  await engine.request({kind:'act',origin:site,tabId:automaticId,interaction:{observationId:logged.observationId,elementId:afterLoginAction.id,operation:'invoke'}})
  assert.match((await engine.request({kind:'observe',origin:site,tabId:automaticId,cachedLogin:true})).text,/查看未读邮件/)
  assert.equal(sessionPosts,beforePosts+1)
  await engine.close();await engine.request({kind:'tabs',origin:site})
  const pending=await engine.context.newPage();await pending.goto(site+'/auto-pending')
  const pendingId=[...engine.pages.entries()].find(([,page])=>page===pending)[0]
  const unresolved=await engine.request({kind:'observe',origin:site,tabId:pendingId,cachedLogin:true})
  assert.equal(unresolved.loginState,'managed_pending');assert.equal(pendingPosts,1);assert.equal(unresolved.text,'');assert.deepEqual(unresolved.controls,[])
  assert.equal((await engine.request({kind:'observe',origin:site,tabId:pendingId,cachedLogin:true})).loginState,'managed_pending')
  assert.equal(pendingPosts,1)
  await engine.configure({sites:[],interactions:[]});assert.equal(engine.context,null)
  await assert.rejects(engine.request({kind:'tabs',origin:site}),/PERMISSION/)
  console.log(JSON.stringify({fixture:'managed-browser',realEdge:true,syntheticAccount:true,productionNetworkPolicy:true,publicDnsOnly:true,manualSsoRedirect:true,loginAgentReadDenied:true,sandboxEnabled,backgroundCrossSiteDenied:true,persistedHttpOnlySession:true,authorizedFrame:true,invokeSelectSearch:true,staleRejected:true,secretInputsExcluded:true,revokedClosed:true,optedInTrustedLogin:true,noLoginWithoutPermission:true,pendingNeverRetried:true,modes,headedWindows,backgroundWindows}))
} finally {await engine.close();await rm(root,{recursive:true,force:true})}
