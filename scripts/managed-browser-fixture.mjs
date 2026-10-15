// Isolated actual Edge test. Synthetic server responses, not a user's account.
import assert from 'node:assert/strict'
import { mkdtemp,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { BrowserEngine } from '../apps/desktop/browser-runtime/engine.mjs'
const require=createRequire(new URL('../apps/desktop/package.json',import.meta.url)),{chromium}=require('playwright-core')
const root=await mkdtemp(join(tmpdir(),'yiyu-managed-fixture-')),profile=join(root,'profile'),site='https://www.example.com'
const modes=[],engine=new BrowserEngine(profile,options=>{modes.push({headless:options.headless});return chromium.launchPersistentContext(profile,options)})
async function route(context) {
  // Last-registered route supplies fictional HTTP responses. Network-policy
  // rejection is covered separately; there is no request to this real domain.
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url())
    assert.equal(url.origin,site)
    const logged=/fixture-session=1/.test(request.headers().cookie??'')
    if(url.pathname==='/session')return route.fulfill({status:302,headers:{location:site+'/inbox','set-cookie':'fixture-session=1; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600'}})
    if(!logged)return route.fulfill({contentType:'text/html; charset=utf-8',body:'<h1>虚构账号登录</h1><form action="/session" method="post"><label>账号<input name="username" value="FICTIONAL-ACCOUNT"></label><label>密码<input type="password" name="password" value="FICTIONAL-SECRET"></label><button>登录</button></form>'})
    if(url.pathname==='/frame')return route.fulfill({contentType:'text/html; charset=utf-8',body:'<p>未读邮件 2</p><a href="/archive">查看历史</a>'})
    return route.fulfill({contentType:'text/html; charset=utf-8',body:'<h1>虚构收件箱</h1><iframe src="/frame"></iframe><button onclick="document.querySelector(\'h1\').textContent=\'查看未读邮件\'">查看未读</button><button>删除邮件</button><input type="text" aria-label="筛选关键词" value="PRIVATE-INPUT-DO-NOT-READ"><select aria-label="筛选状态"><option>全部</option><option>未读</option></select><form method="get" action="/inbox"><input type="search" name="q" aria-label="搜索邮件"></form><a href="https://other.com">跨站</a>'})
  })
}
function visibleOwnedWindows(){
  if(process.platform!=='win32')return null
  const command='$items=Get-CimInstance Win32_Process -Filter "name=\'msedge.exe\'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($env:YIYU_FIXTURE_PROFILE) }; $n=0; foreach($item in $items){$p=Get-Process -Id $item.ProcessId -ErrorAction SilentlyContinue;if($p -and $p.MainWindowHandle -ne 0){$n++}}; Write-Output $n'
  return Number(execFileSync('powershell.exe',['-NoProfile','-Command',command],{env:{...process.env,YIYU_FIXTURE_PROFILE:profile},encoding:'utf8'}).trim())
}
try {
  await engine.configure({sites:[site],interactions:[site]})
  await engine.launch('login');await route(engine.context);await engine.login(site,site)
  const loginPage=[...engine.pages.values()][0]
  const before=await loginPage.locator('input[type=password]').count();assert.equal(before,1)
  const headedWindows=visibleOwnedWindows();if(headedWindows!==null)assert.ok(headedWindows>=1)
  // Explicit fixture-user action, not an agent bypassing credential policy.
  await loginPage.getByRole('button',{name:'登录',exact:true}).click()
  await loginPage.waitForURL(site+'/inbox');await engine.close()
  await engine.request({kind:'tabs',origin:site});await route(engine.context)
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
  await engine.configure({sites:[],interactions:[]});assert.equal(engine.context,null)
  await assert.rejects(engine.request({kind:'tabs',origin:site}),/PERMISSION/)
  console.log(JSON.stringify({fixture:'managed-browser',realEdge:true,syntheticAccount:true,manualFixtureLogin:true,persistedHttpOnlySession:true,authorizedFrame:true,invokeSelectSearch:true,staleRejected:true,secretInputsExcluded:true,revokedClosed:true,modes,headedWindows,backgroundWindows}))
} finally {await engine.close();await rm(root,{recursive:true,force:true})}
