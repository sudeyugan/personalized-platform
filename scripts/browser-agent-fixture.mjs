// Actual isolated Edge + production engine/policy. Fictional pages only.
import assert from 'node:assert/strict'
import { mkdtemp,rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { BrowserEngine } from '../apps/desktop/browser-runtime/engine.mjs'
const require=createRequire(new URL('../apps/desktop/package.json',import.meta.url)),{chromium}=require('playwright-core')
const root=await mkdtemp(join(tmpdir(),'yiyu-agent-fixture-')),site='https://www.example.com'
const engine=new BrowserEngine(join(root,'profile'),async options=>{
  assert.equal(options.headless,true);assert.equal(options.chromiumSandbox,true)
  const context=await chromium.launchPersistentContext(join(root,'profile'),options),route=context.route.bind(context)
  context.route=(pattern,handler)=>route(pattern,current=>handler({request:()=>current.request(),abort:reason=>current.abort(reason),continue:()=>respond(current)}))
  return context
})
const html=body=>`<!doctype html><meta charset="utf-8"><style>button,[role=option],[role=combobox]{display:block;padding:12px;margin:8px;cursor:pointer}input{display:block}</style>${body}`
async function respond(route){
  const url=new URL(route.request().url());assert.equal(url.origin,site)
  const body=url.pathname==='/frame'?'<button aria-label="查看同源通知" onclick="parent.document.querySelector(\'#count\').textContent=\'通知 3 条\'">通知</button>':url.pathname==='/details'?'<h1>课程通知详情</h1><p>通知 1 条</p><p>FICTIONAL-PRIVATE-BODY</p><div role="dialog"><button aria-label="关闭" onclick="this.parentElement.remove()">关闭</button></div><a href="/dashboard">返回列表</a>':`
    <h1>课程通知</h1><p id="count">通知 2 条</p><p>FICTIONAL-PRIVATE-ACCOUNT / FICTIONAL-PRIVATE-BODY</p>
    <button id="dynamic" aria-label="查看未读" onclick="document.querySelector('#count').textContent='通知 1 条'">查看未读</button>
    <div role="combobox" aria-label="筛选状态" onclick="document.querySelector('[role=listbox]').hidden=false">筛选</div>
    <div role="listbox" hidden><div role="option" aria-label="只看未读" onclick="document.querySelector('#count').textContent='通知 1 条';this.parentElement.hidden=true">未读</div></div>
    <input type="checkbox" aria-label="筛选未读" onclick="document.querySelector('#count').textContent='通知 1 条'">
    <label>开始日期<input type="date" aria-label="开始日期"></label><label>结束日期<input type="date" aria-label="结束日期"></label>
    <select aria-label="时间排序"><option>升序</option><option>降序</option></select>
    <select aria-label="账号筛选"><option>FICTIONAL-ACCOUNT-A</option><option>FICTIONAL-ACCOUNT-B</option></select><a href="/switch_account">查看列表</a>
    <a href="/details" target="_blank">查看通知详情</a><iframe src="/frame"></iframe>
    <form method="get" action="/dashboard"><input type="search" name="q" aria-label="搜索通知"></form>
    <button aria-label="标记全部已读">标为已读</button><button aria-label="删除通知">删除</button>`
  return route.fulfill({contentType:'text/html; charset=utf-8',body:html(body)})
}
let tabId,page,observed
const observe=async()=>{observed=await engine.request({kind:'observe',origin:site,tabId});return observed}
const act=async(name,query)=>{
  const control=observed.controls.find(control=>control.name===name||control.name.startsWith(name+'（'));assert.ok(control,`Missing fixture control ${name}`)
  return engine.request({kind:'act',origin:site,tabId,interaction:{observationId:observed.observationId,elementId:control.id,operation:control.operation,...(query!==undefined?{query}:{})}})
}
try{
  await engine.configure({sites:[site],interactions:[site]})
  const tabs=await engine.request({kind:'ensure',origin:site,targetUrl:site+'/dashboard'});tabId=tabs[0].tabId;page=engine.pages.get(tabId)
  await observe();assert.equal(observed.loading,false)
  assert.ok(!observed.controls.some(control=>/删除|标记|账号|查看列表/.test(control.name)))
  // Replace an element with an identical-looking node: old handle must not click.
  await page.locator('#dynamic').evaluate(node=>{node.outerHTML=node.outerHTML})
  await assert.rejects(act('查看未读'),/BROWSER_STALE/)
  assert.match(await page.locator('#count').innerText(),/2/)
  await observe();await act('查看未读');await observe();assert.match(observed.text,/通知 1 条/)
  await act('筛选状态');await observe();await act('只看未读');await observe()
  await act('筛选未读');await observe();assert.equal(await page.locator('input[type=checkbox]').isChecked(),true)
  await act('开始日期','2026-10-12');await observe();await act('结束日期','2026-10-18');await observe()
  assert.equal(await page.locator('input[type=date]').first().inputValue(),'2026-10-12') // fictional non-secret field, fixture only
  await act('时间排序','降序');await observe();assert.equal(await page.getByLabel('时间排序',{exact:true}).inputValue(),'降序')
  await act('查看同源通知');await observe();assert.match(observed.text,/通知 3 条/)
  // A real click has happened before an injected acknowledgement failure.
  const button=observed.controls.find(control=>control.name==='查看未读'),ref=engine.observations.get(tabId).refs.get(button.id),click=ref.handle.click.bind(ref.handle)
  ref.handle.click=async options=>{await click(options);if(!options.trial)throw new Error('fictional acknowledgement lost')}
  await assert.rejects(act('查看未读'),/BROWSER_ACTION_UNKNOWN/)
  await observe();assert.match(observed.text,/通知 1 条/)
  const receipt=await act('查看通知详情');assert.equal(receipt.actionStatus,'dispatched');assert.ok(receipt.nextTabId&&receipt.nextTabId!==tabId)
  tabId=receipt.nextTabId;await observe();assert.equal(observed.origin,site);assert.match(observed.text,/FICTIONAL-PRIVATE-BODY/)
  await act('关闭');await observe();assert.equal(await engine.pages.get(tabId).locator('[role=dialog]').count(),0)
  await act('返回列表');await observe();assert.match(observed.text,/课程通知/)
  console.log(JSON.stringify({ok:true,actualEdge:true,syntheticOnly:true,headless:true,sandbox:true,staleNoDispatch:true,reobserveAndDecide:true,customFilter:true,dateRange:true,sorting:true,sameOriginFrame:true,uncertainObservedNotRetried:true,newTab:true,dialogDismiss:true,returnToList:true}))
}finally{await engine.close();await rm(root,{recursive:true,force:true})}
