import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readJob, decodeFollowPage } from './readers.js'
import { siteOrigin, publicUrl, authorisedSites, BILIBILI_SITES } from './policy.js'
import manifest from './manifest.json'
const room={uid:101,room_id:202,uname:'虚构主播',title:'测试直播',live_status:1}
beforeEach(()=>{vi.stubGlobal('chrome',{permissions:{contains:vi.fn(async()=>true),getAll:vi.fn(async()=>({origins:['https://example.com/*','https://*/*','http://127.0.0.1/*']}))},tabs:{query:vi.fn(async()=>[{id:7,url:'https://example.com/mail?token=secret',title:'虚构页面',incognito:false}]),get:vi.fn(async()=>({url:'https://example.com/mail',incognito:false}))},scripting:{executeScript:vi.fn(async request=>request.func.name==='inspectLoginForm'?[{result:{status:'none'}}]:[{result:{origin:'https://example.com',url:'https://example.com/mail',text:'虚构正文',title:'虚构',links:[],loading:false,truncated:false}}])}})})
afterEach(()=>vi.unstubAllGlobals())
describe('extension actual read adapters',()=>{
  it('only asks optional hosts, no cookie/debugger/tabs or automatic all-sites grants',()=>{
    expect(manifest.permissions).toEqual(['storage','scripting','alarms']);expect(manifest.host_permissions).toEqual(['http://127.0.0.1/*']);expect(manifest.incognito).toBe('not_allowed')
  })
  it('normalizes exact hosts and drops wildcard/private metadata and URL query secrets',async()=>{
    expect(await authorisedSites()).toEqual(['https://example.com'])
    expect(publicUrl('https://example.com/mail?token=secret#code')).toBe('https://example.com/mail')
    for(const value of ['http://example.com','https://*.example.com','https://127.0.0.1','https://x.local','https://example.com:8443']) expect(()=>siteOrigin(value)).toThrow()
  })
  it('requires permission before querying and omits incognito and credential URL parameters',async()=>{
    const tabs=await readJob({kind:'tabs',origin:'https://example.com'});expect(tabs).toEqual([{tabId:7,origin:'https://example.com',title:'虚构页面',url:'https://example.com/mail'}])
    chrome.permissions.contains.mockResolvedValue(false);await expect(readJob({kind:'tabs',origin:'https://example.com'})).rejects.toThrow('permission')
  })
  it('fails closed after navigation or revocation while a page was being read',async()=>{
    chrome.tabs.get.mockResolvedValueOnce({url:'https://example.com/mail'}).mockResolvedValueOnce({url:'https://other.com/mail'})
    await expect(readJob({kind:'page',origin:'https://example.com',tabId:7},async()=>{})).rejects.toThrow('tab_changed')
    chrome.permissions.contains.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    await expect(readJob({kind:'page',origin:'https://example.com',tabId:7},async()=>{})).rejects.toThrow('permission')
  })
  it('uses only fixed official GETs, keeps session inside browser, and does not infer unknown completeness',async()=>{
    const fetch=vi.fn(async url=>new Response(JSON.stringify(url.includes('/nav')?{code:0,data:{isLogin:true}}:{code:0,data:{rooms:[room]}}),{headers:{'content-type':'application/json'}}));vi.stubGlobal('fetch',fetch)
    const result=await readJob({kind:'followed_live',origin:BILIBILI_SITES[0]})
    expect(result).toMatchObject({loggedIn:true,checked:1,total:null,complete:false,rooms:[{liveStatus:1,name:'虚构主播'}]})
    expect(fetch.mock.calls.map(([url])=>url)).toEqual(['https://api.bilibili.com/x/web-interface/nav','https://api.live.bilibili.com/xlive/web-ucenter/v1/xfetter/GetWebList?hit_ab=true'])
    expect(fetch.mock.calls[0][1]).toMatchObject({method:'GET',credentials:'include',redirect:'error'})
  })
  it('login failure makes no follow request and unknown statuses never become offline',async()=>{
    const fetch=vi.fn(async()=>new Response(JSON.stringify({code:-101}),{headers:{'content-type':'application/json'}}));vi.stubGlobal('fetch',fetch)
    await expect(readJob({kind:'followed_live',origin:BILIBILI_SITES[0]})).rejects.toThrow('login');expect(fetch).toHaveBeenCalledOnce()
    expect(()=>decodeFollowPage({code:0,data:{rooms:[{...room,live_status:undefined}]}})).toThrow('failed')
    expect(decodeFollowPage({code:0,data:{rooms:[]}})).toEqual({rooms:[],total:null})
  })
  it('rejects arbitrary action names, raw HTTP and script execution',async()=>{
    for(const kind of ['fetch','click','fill','javascript']) await expect(readJob({kind,origin:'https://example.com'})).rejects.toThrow('failed')
  })
})
