import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import { maintainQueryWindow,prepareQueryPage,queryTabs,assertQueryTab } from './query-window.js'
import { readJob } from './readers.js'
const origin='https://mail.example.com',job={id:'fixture',origin,queryMode:'background',targetUrl:origin+'/inbox'},config={enabled:true,sites:[origin],epoch:1}
let api,store,tabs,windows,active,nextId
const clone=value=>structuredClone(value)
beforeEach(async()=>{
  store={};nextId=100;active=vi.fn(async()=>{});tabs=new Map([[5,{id:5,windowId:1,url:origin+'/daily',title:'日常页'}]]);windows=new Map([[1,{id:1,incognito:false,focused:true,state:'normal'}]])
  const storage={get:vi.fn(async()=>clone(store)),set:vi.fn(async data=>Object.assign(store,clone(data))),remove:vi.fn(async key=>{delete store[key]})}
  api={runtime:{getURL:path=>'chrome-extension://reader/'+path},storage:{session:storage},permissions:{contains:vi.fn(async()=>true)},windows:{
    get:vi.fn(async id=>{if(!windows.has(id))throw new Error('closed');return clone(windows.get(id))}),
    create:vi.fn(async options=>{const id=nextId++,marker={id:nextId++,windowId:id,url:options.url};tabs.set(marker.id,marker);const value={id,focused:options.focused,state:options.state,incognito:options.incognito};windows.set(id,value);return {...value,tabs:[marker]}}),
    update:vi.fn(async(id,options)=>{const value=windows.get(id);if(!value)throw new Error('closed');Object.assign(value,options);if(options.state==='minimized')value.focused=false;return clone(value)}),
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
it('initializes a just-created normal/focused window before publishing the lease or creating a website tab',async()=>{
  const create=api.windows.create.getMockImplementation()
  api.windows.create.mockImplementationOnce(async options=>{const result=await create(options);Object.assign(windows.get(result.id),{state:'normal',focused:true});return result})
  api.windows.update.mockImplementationOnce(async(id,options)=>{
    expect(store.queryWindow).toBeUndefined();expect(api.tabs.create).not.toHaveBeenCalled()
    Object.assign(windows.get(id),{...options,focused:false});return clone(windows.get(id))
  })
  const [page]=await prepareQueryPage(job,active)
  expect(api.windows.update).toHaveBeenCalledExactlyOnceWith(100,{state:'minimized'})
  expect(await queryTabs(job)).toMatchObject([{id:page.id}]);expect(windows.get(1).focused).toBe(true)
  await prepareQueryPage(job,active);expect(api.windows.update).toHaveBeenCalledOnce()
})
it('waits for the initial marker URL to commit rather than mistaking it for a user navigation',async()=>{
  const get=api.tabs.get.getMockImplementation();let reads=0
  api.tabs.get.mockImplementation(async id=>id===101&&reads++<2?{id,windowId:100,url:'about:blank'}:get(id))
  expect(await prepareQueryPage(job,active)).toHaveLength(1)
  expect(store.queryWindow.markerId).toBe(101);expect(api.windows.remove).not.toHaveBeenCalled()
})
it('cleans the exact fresh marker-only window if explicit minimization fails; never reports a user tab change',async()=>{
  const create=api.windows.create.getMockImplementation()
  api.windows.create.mockImplementationOnce(async options=>{const result=await create(options);windows.get(result.id).state='normal';return result})
  api.windows.update.mockRejectedValueOnce(new Error('fixture OS rejected minimize'))
  await expect(prepareQueryPage(job,active)).rejects.toThrow('page_open')
  expect(api.windows.remove).toHaveBeenCalledExactlyOnceWith(100);expect(windows.has(1)).toBe(true)
  expect(store.queryWindow).toBeUndefined();expect(api.tabs.create).not.toHaveBeenCalled()
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
function readableDailyPage(status='none'){
  tabs.get(5).status='complete'
  api.scripting={executeScript:vi.fn(async request=>[{result:request.func.name==='inspectLoginForm'?{status}:request.func.name==='snapshotPage'?{origin,url:origin+'/daily',title:'虚构收件箱',text:'未读 2',links:[],loading:false,truncated:false}:{observationId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',controls:[{id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',name:'未读',operation:'invoke'}]}}])}
}
it('reads an already open unique authorized page without opening/focusing/navigating any window or logging in',async()=>{
  readableDailyPage()
  expect(await readJob({...job,kind:'tabs'},active)).toMatchObject([{tabId:5}])
  const result=await readJob({...job,kind:'page',tabId:5,cachedLogin:true},active)
  expect(result.text).toBe('未读 2');expect(result.controls).toEqual([])
  expect(result.observationId).toBeTruthy();expect(api.windows.create).not.toHaveBeenCalled();expect(api.tabs.create).not.toHaveBeenCalled()
  expect(api.scripting.executeScript.mock.calls.filter(([r])=>r.func.name==='inspectLoginForm').every(([r])=>!r.args?.[0])).toBe(true)
  expect(await assertQueryTab({...job,kind:'observe',tabId:5})).toEqual({borrowed:true})
  await expect(readJob({...job,kind:'act',tabId:5},active)).rejects.toThrow('tab_changed')
  await maintainQueryWindow(null);expect(tabs.has(5)).toBe(true);expect(api.windows.remove).not.toHaveBeenCalled()
})
it('does not select an ambiguous, loading or login page for read-only borrowing',async()=>{
  readableDailyPage('ready');expect(await queryTabs(job,active)).toEqual([])
  readableDailyPage();tabs.get(5).status='loading';expect(await queryTabs(job,active)).toEqual([])
  tabs.get(5).status='complete';tabs.set(6,{id:6,windowId:1,url:origin+'/other',status:'complete'})
  api.scripting.executeScript.mockClear();expect(await queryTabs(job,active)).toEqual([]);expect(api.scripting.executeScript).not.toHaveBeenCalled()
})
it('revokes a borrowed page on navigation or scope change, rather than clicking/reusing a stale reference',async()=>{
  readableDailyPage();await queryTabs(job,active);tabs.get(5).url=origin+'/changed'
  await expect(assertQueryTab({...job,kind:'page',tabId:5})).rejects.toThrow('tab_changed')
  await maintainQueryWindow({...config,epoch:2})
  await expect(assertQueryTab({...job,kind:'page',tabId:5})).rejects.toThrow('tab_changed')
  expect(api.windows.remove).not.toHaveBeenCalled()
})
