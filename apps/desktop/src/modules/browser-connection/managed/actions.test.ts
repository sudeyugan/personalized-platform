import { expect,it,vi } from 'vitest'
import { act } from '../../../../browser-runtime/actions.mjs'
import type { ActionObservation } from '../../../../browser-runtime/actions.mjs'
import type { Page } from 'playwright-core'
function fixture(){
  const observationId=crypto.randomUUID(),elementId=crypto.randomUUID(),url='https://example.com/inbox',info={name:'查看未读',operation:'invoke'}
  const click=vi.fn(async(_options?:unknown)=>{}),handle={evaluate:vi.fn(async():Promise<typeof info|null>=>info),click}
  const page={url:()=>url},observation={value:{loading:false,loginState:'continued'},observationId,url,created:Date.now(),refs:new Map([[elementId,{url,frame:{url:()=>url},document:{evaluate:async()=>true},handle,info}]])}
  return {click,handle,page:page as unknown as Page,observation:observation as unknown as ActionObservation,action:{observationId,elementId,operation:'invoke'}}
}
it('accepts continued with a fresh unchanged control and uses trial before the actual click',async()=>{
  const f=fixture();await act(f.page,f.observation,f.action)
  expect(f.click.mock.calls.map(call=>call[0])).toEqual([{trial:true,timeout:3000},{timeout:5000}])
})
it('distinguishes stale, blocked before dispatch and unknown after starting dispatch',async()=>{
  const f=fixture();f.handle.evaluate.mockResolvedValueOnce(null)
  await expect(act(f.page,f.observation,f.action)).rejects.toThrow('BROWSER_STALE');expect(f.click).not.toHaveBeenCalled()
  f.click.mockRejectedValueOnce(new Error('occluded'))
  await expect(act(f.page,f.observation,f.action)).rejects.toThrow('BROWSER_ACTION_BLOCKED')
  f.click.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('timeout after dispatch'))
  await expect(act(f.page,f.observation,f.action)).rejects.toThrow('BROWSER_ACTION_UNKNOWN')
})
