import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {fireEvent,waitFor} from '@testing-library/react'
const calls=vi.hoisted(()=>({bridge:vi.fn(),sites:vi.fn()}))
vi.mock('./policy.js',async importOriginal=>({...await importOriginal(),bridgeCall:calls.bridge,authorisedSites:calls.sites}))
let api,stored,pending
beforeEach(()=>{
  vi.resetModules();calls.bridge.mockReset();calls.sites.mockReset()
  pending={id:'b'.repeat(64),sites:['https://mail.example.com'],openOrigin:'https://mail.example.com',epoch:4,expiresAt:Date.now()+180000}
  stored={connectionCode:'fixture-only',pendingSetup:pending,browserConfig:{enabled:true,epoch:4,sites:pending.sites}}
  document.body.innerHTML='<div id="setupSites"></div><button id="confirmSetup" disabled></button><button id="cancelSetup" disabled></button><p id="setupStatus"></p>'
  api={storage:{local:{get:vi.fn(async()=>stored),set:vi.fn(async value=>Object.assign(stored,value))},onChanged:{addListener:vi.fn()}},runtime:{sendMessage:vi.fn(async()=>({ok:true}))},permissions:{request:vi.fn(async()=>true),remove:vi.fn(async()=>true)},tabs:{create:vi.fn(async()=>({id:1}))}}
  vi.stubGlobal('chrome',api);calls.sites.mockResolvedValue(pending.sites)
  calls.bridge.mockImplementation(async(_path,body)=>body.action==='inspect'?pending:body.action==='complete'?{completed:true,openOrigin:pending.openOrigin}:{cancelled:true})
})
afterEach(()=>{document.body.innerHTML='';vi.unstubAllGlobals()})
async function ready(){await import('./setup.js');await waitFor(()=>expect(document.getElementById('confirmSetup').disabled).toBe(false))}
describe('real extension click confirmation logic',()=>{
  it('requests permissions directly in the click, then verifies before opening only the chosen site',async()=>{
    await ready();expect(api.permissions.request).not.toHaveBeenCalled();expect(api.tabs.create).not.toHaveBeenCalled()
    fireEvent.click(document.getElementById('confirmSetup'));expect(api.permissions.request).toHaveBeenCalledWith({origins:['https://mail.example.com/*']})
    await waitFor(()=>expect(api.tabs.create).toHaveBeenCalledWith({url:'https://mail.example.com'}));expect(document.getElementById('setupStatus').textContent).toContain('网站已连接')
    expect(stored.pendingSetup).toBeNull()
  })
  it('keeps refusal local and never opens the website or silently retries permissions',async()=>{
    api.permissions.request.mockResolvedValue(false);await ready();fireEvent.click(document.getElementById('confirmSetup'))
    await waitFor(()=>expect(document.getElementById('setupStatus').textContent).toContain('已取消授权'))
    expect(api.tabs.create).not.toHaveBeenCalled();expect(api.permissions.request).toHaveBeenCalledOnce();expect(calls.bridge).toHaveBeenCalledWith('/setup',{id:pending.id,action:'cancel'},'fixture-only')
  })
  it('releases selected permissions when confirmation returns after native cancellation/revocation',async()=>{
    calls.bridge.mockImplementation(async(_path,body)=>{if(body.action==='inspect')return pending;throw new Error('stale')})
    await ready();fireEvent.click(document.getElementById('confirmSetup'))
    await waitFor(()=>expect(api.permissions.remove).toHaveBeenCalledWith({origins:['https://mail.example.com/*']}));expect(api.tabs.create).not.toHaveBeenCalled()
  })
  it('does not enable a forged or expired request',async()=>{
    calls.bridge.mockResolvedValue({...pending,sites:['https://other.example.com']});await import('./setup.js')
    await waitFor(()=>expect(document.getElementById('setupStatus').textContent).toContain('已停止'))
    expect(document.getElementById('confirmSetup').disabled).toBe(true);expect(api.permissions.request).not.toHaveBeenCalled()
  })
  it('respects the no-opening choice and cancels without an Edge grant',async()=>{
    pending.openOrigin=null;await ready();fireEvent.click(document.getElementById('cancelSetup'))
    await waitFor(()=>expect(document.getElementById('setupStatus').textContent).toContain('已取消本次连接'))
    expect(api.permissions.request).not.toHaveBeenCalled();expect(api.tabs.create).not.toHaveBeenCalled()
  })
  it('keeps a confirmed connection when optional page opening fails',async()=>{
    api.tabs.create.mockRejectedValue(new Error('tab creation failed'));await ready();fireEvent.click(document.getElementById('confirmSetup'))
    await waitFor(()=>expect(document.getElementById('setupStatus').textContent).toContain('网站已连接，但页面未能打开'))
    expect(api.permissions.remove).not.toHaveBeenCalled()
  })
})
