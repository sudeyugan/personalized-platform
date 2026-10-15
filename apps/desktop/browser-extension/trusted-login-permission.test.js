import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import { bindTrustedLoginPermission,connectTrustedHelper } from './trusted-login-permission.js'
import { TRUSTED_HELPER_REVISION } from './trusted-helper-revision.js'
import { TRUSTED_HELPER_ID } from './trusted-helper-id.js'
let api,store,change,checkbox,status,connected
beforeEach(()=>{
  connected=true;store={trustedLoginEnabled:false};checkbox={checked:false,disabled:false,addEventListener:(_,fn)=>{change=fn}};status={textContent:''}
  api={runtime:{id:'reader',sendMessage:vi.fn(async()=>({installed:true,connected,revision:TRUSTED_HELPER_REVISION}))},storage:{local:{get:vi.fn(async()=>store),set:vi.fn(async v=>Object.assign(store,v))}},tabs:{create:vi.fn(async()=>{})},permissions:{request:vi.fn(),remove:vi.fn()}}
  vi.stubGlobal('chrome',api)
})
afterEach(()=>vi.unstubAllGlobals())
it('only changes local opt-in, never requests non-optional debugger',async()=>{
  bindTrustedLoginPermission(checkbox,status);await vi.waitFor(()=>expect(status.textContent).toContain('已连接'))
  checkbox.checked=true;await change();expect(store.trustedLoginEnabled).toBe(true)
  checkbox.checked=false;await change();expect(store.trustedLoginEnabled).toBe(false)
  expect(api.permissions.request).not.toHaveBeenCalled();expect(api.permissions.remove).not.toHaveBeenCalled()
})
it('cannot enable an unconnected component',async()=>{
  connected=false;bindTrustedLoginPermission(checkbox,status);await vi.waitFor(()=>expect(status.textContent).toContain('连接'))
  checkbox.checked=true;await change();expect(store.trustedLoginEnabled).toBe(false);expect(checkbox.checked).toBe(false)
})
it('opens the fixed helper pairing page with a single-use 3 minute nonce',async()=>{
  const now=Date.now();await connectTrustedHelper()
  expect(store.trustedLoginPending.expires).toBeGreaterThanOrEqual(now+180000)
  expect(api.tabs.create.mock.calls[0][0].url).toBe(`chrome-extension://${TRUSTED_HELPER_ID}/connect.html#reader=reader&nonce=${store.trustedLoginPending.nonce}`)
})
