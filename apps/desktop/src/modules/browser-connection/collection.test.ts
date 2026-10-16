import { afterEach,expect,it,vi } from 'vitest'
import { BrowserCollection } from './collection'
import type { BrowserReadRequest,BrowserSnapshot } from './native'
const origin='https://mail.example.com',request={origin,tabId:4},task={objective:'mail' as const,origins:[origin],candidates:[origin]}
function fixture(pages:Array<Record<string,unknown>>){
  let index=0
  const read=vi.fn(async(req:BrowserReadRequest):Promise<BrowserSnapshot>=>{
    if(req.kind==='act'){index++;return {verified:true as const,data:{actionStatus:'dispatched'},origin,untrusted:true as const,privateBrowser:true as const,fetchedAtEpochMs:Date.now()}}
    return {verified:true as const,data:{...request,url:origin+'/inbox',title:'收件箱',text:`未读邮件 ${index+1}\n共有的标题`,observationId:crypto.randomUUID(),loading:false,truncated:false,controls:[{id:crypto.randomUUID(),operation:'invoke',name:'下一页'}],...pages[Math.min(index,pages.length-1)]},origin,untrusted:true as const,privateBrowser:true as const,fetchedAtEpochMs:Date.now()}
  })
  return {read,collection:new BrowserCollection(read,'汇总我的未读邮件',task)}
}
afterEach(()=>vi.useRealTimers())
it('collects bounded pages, deduplicates shared text and verifies per-page evidence with a fresh last page',async()=>{
  const {read,collection}=fixture([{}, {text:'未读邮件 2\n共有的标题\n没有更多了',controls:[]}])
  const result=await collection.collect(request)
  expect(result).toMatchObject({visitedPages:2,stopReason:'end_marker',complete:false,scope:'visited_pages'})
  expect(result.pages[1].text).not.toContain('共有的标题')
  const input={...request,collectionId:result.collectionId,quotes:[{page:1,text:'未读邮件 1'},{page:2,text:'未读邮件 2'}],answer:'两个已访问页面分别显示未读邮件1和2。'}
  expect(await collection.verify(input)).toMatchObject({goalVerified:true,visitedPages:2,partial:true})
  expect(read.mock.calls.filter(([r])=>r.kind==='act')).toHaveLength(1)
  await expect(collection.verify({...input,quotes:[{page:2,text:'未读邮件 1'}]})).rejects.toThrow('对应')
  await expect(collection.verify({...input,answer:'所有邮件已查完。'})).rejects.toThrow('全账号')
  await expect(collection.collect(request)).rejects.toThrow('已经')
})
it('stops on the 4-page limit, loops, missing/ambiguous next controls and unavailable pages',async()=>{
  const cases:Array<[Array<Record<string,unknown>>,string,number]>=[
    [[{},{},{},{},{}],'page_limit',4],
    [[{text:'未读邮件 1'},{text:'未读邮件 1'}],'repeated_page',1],
    [[{controls:[]}],'no_next',1],
    [[{controls:[{name:'下一页',operation:'invoke',id:'a'},{name:'下一页',operation:'invoke',id:'b'}]}],'ambiguous_next',1],
    [[{truncated:true}],'page_unavailable',0],[[{loading:true}],'page_unavailable',0],[[{loginState:'managed_login'}],'page_unavailable',0],
  ]
  for(const [pages,reason,count]of cases){const {collection}=fixture(pages);expect(await collection.collect(request)).toMatchObject({stopReason:reason,visitedPages:count,complete:false})}
})
it('does not retry uncertain actions and refuses changed or expired evidence',async()=>{
  const {read,collection}=fixture([{controls:[]}]),result=await collection.collect(request)
  const input={...request,collectionId:result.collectionId,quotes:[{page:1,text:'未读邮件 1'}],answer:'当前页面显示1。'}
  read.mockImplementationOnce(async()=>({verified:true,data:{text:'changed'},origin,untrusted:true,privateBrowser:true,fetchedAtEpochMs:Date.now()}))
  await expect(collection.verify(input)).rejects.toThrow('末页')
  vi.useFakeTimers();vi.advanceTimersByTime(90001);await expect(collection.verify(input)).rejects.toThrow('过期')
  const fail=fixture([{},{}]);fail.read.mockImplementationOnce(async()=>{throw new Error('cancelled')});await expect(fail.collection.collect(request)).rejects.toThrow('cancelled')
})
