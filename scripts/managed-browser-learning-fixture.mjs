// Real Edge, fictional HTTPS transport only. Never user accounts or providers.
import assert from 'node:assert/strict'
import { mkdtemp,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { BrowserEngine } from '../apps/desktop/browser-runtime/engine.mjs'
const require=createRequire(new URL('../apps/desktop/package.json',import.meta.url)),{chromium}=require('playwright-core')
const root=await mkdtemp(join(tmpdir(),'yiyu-learning-fixture-')),site='https://www.example.com'
const modes=[],engine=new BrowserEngine(join(root,'profile'),async options=>{
  modes.push(options.headless)
  const context=await chromium.launchPersistentContext(join(root,'profile'),options),register=context.route.bind(context)
  context.route=(pattern,handler)=>register(pattern,route=>handler({request:()=>route.request(),abort:reason=>route.abort(reason),continue:()=>route.fulfill({contentType:'text/html; charset=utf-8',body:new URL(route.request().url()).pathname==='/frame'?'<button>未读</button>':'<h1>虚构收件箱</h1><input value="FICTIONAL-ACCOUNT"><input type="password" value="FICTIONAL-SECRET"><button onclick="document.querySelector(\'h1\').textContent=\'未读邮件2\'">未读</button><button>PRIVATE-UNKNOWN-LABEL</button><a href="/demo2">下一页</a><iframe src="/frame"></iframe>'})}))
  return context
})
try{
  await engine.configure({sites:[site],interactions:[site]})
  let record=await engine.record({action:'begin',origin:site,url:site+'/demo'})
  assert.equal(record.phase,'recording');assert.equal(modes[0],false)
  const id=record.id,page=[...engine.pages.values()].find(page=>page.url().startsWith(site))
  await assert.rejects(engine.request({kind:'observe',origin:site,tabId:record.tabId}),/LOGIN_ACTIVE/)
  await assert.rejects(engine.login(site,site),/BUSY/)
  assert.equal(await page.evaluate(name=>typeof globalThis[name],engine.recorder.binding),'undefined')
  await page.getByRole('button',{name:'未读',exact:true}).evaluate(button=>button.click())
  record=await engine.record({action:'status'});assert.deepEqual(record.events,[])
  await page.getByRole('button',{name:'未读',exact:true}).click()
  record=await engine.record({action:'status'});assert.deepEqual(record.events,['unread'])
  await engine.record({action:'pause',recordingId:id})
  await page.getByRole('button',{name:'未读',exact:true}).click();record=await engine.record({action:'status'});assert.deepEqual(record.events,['unread'])
  await engine.record({action:'resume',recordingId:id})
  await page.getByRole('link',{name:'下一页',exact:true}).click();await page.waitForURL(site+'/demo2')
  record=await engine.record({action:'status'});assert.deepEqual(record.events,['unread','next','navigation'])
  await page.getByRole('button',{name:'PRIVATE-UNKNOWN-LABEL',exact:true}).click()
  record=await engine.record({action:'status'});assert.equal(record.events.at(-1),'unknown_button')
  assert.doesNotMatch(JSON.stringify(record),/PRIVATE|FICTIONAL|SECRET|ACCOUNT/)
  await page.locator('[data-yiyu-recording]').evaluate(node=>node.remove())
  record=await engine.record({action:'status'});assert.equal(record.phase,'review')
  assert.equal(await page.locator('[data-yiyu-recording]').count(),0)
  await page.close();await new Promise(resolve=>setTimeout(resolve,100))
  await assert.rejects(engine.request({kind:'tabs',origin:site}),/LOGIN_ACTIVE/)
  assert.equal((await engine.record({action:'status'})).id,id)
  assert.equal(await engine.record({action:'cancel',recordingId:id}),null)
  assert.equal(engine.context,null)
  await engine.login(site,site+'/demo')
  assert.deepEqual(await engine.finishLogin(),{mode:'idle',origin:site});assert.equal(engine.context,null)
  record=await engine.record({action:'begin',origin:site,url:site+'/demo'})
  engine.recorder.renewed=Date.now()-5000
  record=await engine.record({action:'status'});assert.equal(record.phase,'review')
  await engine.configure({sites:[],interactions:[]});assert.equal(await engine.record({action:'status'}),null)
  console.log(JSON.stringify({ok:true,headedOnlyForDemo:true,isolatedBinding:true,syntheticClicksIgnored:true,trustedCues:true,navigationPreserved:true,pause:true,overlayRemovalStops:true,leaseAndRevocation:true,noPrivateContent:true}))
}finally{await engine.close();await rm(root,{recursive:true,force:true})}
