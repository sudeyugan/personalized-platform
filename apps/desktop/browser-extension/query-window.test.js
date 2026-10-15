import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import { maintainQueryWindow,prepareQueryPage,queryTabs,assertQueryTab } from './query-window.js'
const origin='https://mail.example.com',job={id:'fixture',origin,queryMode:'background',targetUrl:origin+'/inbox'},config={enabled:true,sites:[origin],epoch:1}
let api,store,tabs,windows,active,nextId
const clone=value=>structuredClone(value)
beforeEach(async()=>{
  store={};nextId=100;active=vi.fn(async()=>{});tabs=new Map([[5,{id:5,windowId:1,url:origin+'/daily',title:'日常页'}]]);windows=new Map([[1,{id:1,incognito:false,focused:true,state:'normal'}]])
  const storage={get:vi.fn(async()=>clone(store)),set:vi.fn(async data=>Object.assign(store,clone(data))),remove:vi.fn(async key=>{delete store[key]})}
  api={runtime:{getURL:path=>'chrome-extension://reader/'+path},storage:{session:storage},permissions:{contains:vi.fn(async()=>true)},windows:{
    get:vi.fn(async id=>{if(!windows.has(id))throw new Error('closed');return clone(windows.get(id))}),
    create:vi.fn(async options=>{const id=nextId++,marker={id:nextId++,windowId:id,url:options.url};tabs.set(marker.id,marker);const value={id,focused:options.focused,state:options.state,incognito:options.incognito};windows.set(id,value);return {...value,tabs:[marker]}}),
    remove:vi.fn(async id=>{windows.delete(id);for(const [tabId,tab]of tabs)if(tab.windowId===id)tabs.delete(tabId)}),
  },tabs:{
    get:vi.fn(async id=>{if(!tabs.has(id))throw new Error('closed');return clone(tabs.get(id))}),
    query:vi.fn(async options=>[...tabs.values()].filter(tab=>options.windowId!==undefined?tab.windowId===options.windowId:tab.url.startsWith(options.url.replace('*',''))).map(clone)),
    create:vi.fn(async options=>{const value={id:nextId++,windowId:options.windowId,url:options.url,status:'complete'};tabs.set(value.id,value);return clone(value)}),
    remove:vi.fn(async id=>{tabs.delete(id)}),
  }};vi.stubGlobal('chrome',api);await maintainQueryWindow(null);await maintainQueryWindow(config)
})
afterEach(async()=>{await maintainQueryWindow(null);vi.unstubAllGlobals();vi.useRealTimers()})
it('creates a minimized nonfocused same-profile window, never a daily tab; reuses it',async()=>{
  expect(await queryTabs(job)).toEqual([])
  const first=await prepareQueryPage(job,active),second=await prepareQueryPage(job,active)
  expect(first[0].id).toBe(second[0].id);expect(api.windows.create).toHaveBeenCalledOnce()
  expect(api.windows.create.mock.calls[0][0]).toMatchObject({state:'minimized',focused:false,incognito:false})
  expect(api.tabs.create.mock.calls[0][0]).toMatchObject({windowId:100,url:job.targetUrl,active:false})
  expect(tabs.get(5)).toEqual({id:5,windowId:1,url:origin+'/daily',title:'日常页'});expect(windows.get(1).focused).toBe(true)
  expect(store.queryWindow.pages).toEqual([{tabId:first[0].id,origin}]);expect(JSON.stringify(store)).not.toContain('/inbox')
})
it('uses only a unique safe current-page URL hint, not credentials or ambiguous accounts',async()=>{
  const first=await prepareQueryPage({...job,targetUrl:undefined},active);expect(first[0].url).toBe(origin+'/daily')
  await maintainQueryWindow(null);await maintainQueryWindow(config);tabs.set(6,{id:6,windowId:1,url:origin+'/other'})
  const second=await prepareQueryPage({...job,targetUrl:undefined},active);expect(second[0].url).toBe(origin)
})
it('rejects a user tab or a moved query tab for background actions',async()=>{
  const [tab]=await prepareQueryPage(job,active)
  await expect(assertQueryTab({...job,tabId:5})).rejects.toThrow('tab_changed')
  tabs.get(tab.id).windowId=1
  await expect(assertQueryTab({...job,tabId:tab.id})).rejects.toThrow('tab_changed')
  await maintainQueryWindow(null);expect(tabs.has(tab.id)).toBe(true);expect(tabs.has(5)).toBe(true)
})
it.each(['restored','foreign-tab','moved-marker'])('does not close an adopted/unprovable window: %s',async cause=>{
  await prepareQueryPage(job,active);const saved=clone(store.queryWindow)
  if(cause==='restored')windows.get(saved.windowId).state='normal'
  if(cause==='foreign-tab')tabs.set(900,{id:900,windowId:saved.windowId,url:'https://other.example.com'})
  if(cause==='moved-marker')tabs.get(saved.markerId).windowId=1
  await maintainQueryWindow(null);expect(api.windows.remove).not.toHaveBeenCalled();expect(windows.has(saved.windowId)).toBe(true);expect(store.queryWindow).toBeUndefined()
})
it('closes only its minimized window on revocation or expiry, not the daily window',async()=>{
  await prepareQueryPage(job,active);await maintainQueryWindow({...config,epoch:2})
  expect(api.windows.remove).toHaveBeenCalledExactlyOnceWith(100);expect(windows.has(1)).toBe(true)
  await maintainQueryWindow(config);await prepareQueryPage(job,active);store.queryWindow.usedAt=Date.now()-300001;await maintainQueryWindow(config)
  expect(api.windows.remove).toHaveBeenCalledTimes(2);expect(tabs.has(5)).toBe(true)
})
it('cleans a late created window after cancellation without orphaning or closing a user page',async()=>{
  const create=api.windows.create.getMockImplementation();let finish
  api.windows.create.mockImplementationOnce(options=>new Promise(resolve=>{finish=async()=>resolve(await create(options))}))
  const pending=prepareQueryPage(job,active),assertion=expect(pending).rejects.toThrow('permission')
  await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));const stopped=maintainQueryWindow(null);await finish();await assertion;await stopped
  expect(api.windows.remove).toHaveBeenCalledOnce();expect(windows.size).toBe(1);expect(tabs.has(5)).toBe(true);expect(store.queryWindow).toBeUndefined()
})
it('stops before creating anything if scope or host permission is absent',async()=>{
  api.permissions.contains.mockResolvedValue(false);await expect(prepareQueryPage(job,active)).rejects.toThrow('permission');expect(api.windows.create).not.toHaveBeenCalled()
})
