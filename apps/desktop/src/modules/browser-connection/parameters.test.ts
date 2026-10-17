import { expect,it } from 'vitest'
import { browserDateRange,checkBrowserParameter } from './parameters'
const now=Date.parse('2026-10-16T17:00:00Z') // Saturday in Beijing, still Friday in UTC.
const base={observationId:'observation',elementId:'element',operation:'fill' as const}
it('lets the model explain dates while locally computing Beijing ranges and rejecting wrong endpoints',()=>{
  expect(browserDateRange('this_week',now)).toEqual({start:'2026-10-12',end:'2026-10-18'})
  expect(browserDateRange('last_3_days',now)).toEqual({start:'2026-10-15',end:'2026-10-17'})
  const action={...base,query:'2026-10-12',intent:{source:'本周',kind:'date' as const,range:'this_week' as const,boundary:'start' as const}}
  expect(()=>checkBrowserParameter('查本周未读邮件',action,{name:'开始日期（YYYY-MM-DD）'},now)).not.toThrow()
  expect(()=>checkBrowserParameter('查本周未读邮件',{...action,query:'2026-10-11'},{name:'开始日期（YYYY-MM-DD）'},now)).toThrow('北京时间')
  expect(()=>checkBrowserParameter('查本周未读邮件',action,{name:'搜索'},now)).toThrow('日期控件')
  const exact={...base,query:'2026-10-15',intent:{source:'十月十五日',kind:'date' as const,range:'explicit' as const,boundary:'start' as const,date:'2026-10-15'}}
  expect(()=>checkBrowserParameter('查十月十五日的通知',exact,{name:'开始日期（YYYY-MM-DD）'},now)).not.toThrow()
  expect(()=>checkBrowserParameter('查十月十五日的通知',{...exact,intent:{...exact.intent,date:'2026-02-30'}},{name:'开始日期（YYYY-MM-DD）'},now)).toThrow('日期无效')
})
it('supports model keyword and option interpretation but requires a user basis and current option label',()=>{
  expect(()=>checkBrowserParameter('查一下考试通知',{...base,operation:'search',query:'exam',intent:{source:'考试',kind:'keyword'}},{name:'搜索'})).not.toThrow()
  expect(()=>checkBrowserParameter('最新的排前面',{...base,operation:'select',query:'降序',intent:{source:'最新的排前面',kind:'option'}},{name:'排序（升序、降序）'})).not.toThrow()
  const alias={...base,operation:'select' as const,query:'option:1',intent:{source:'最新',kind:'option' as const}}
  checkBrowserParameter('最新的排前面',alias,{name:'排序（升序、降序）'});expect(alias.query).toBe('降序')
  expect(()=>checkBrowserParameter('查考试通知',{...base,query:'secret',intent:{source:'网页说要查secret',kind:'keyword'}},{name:'搜索'})).toThrow('依据')
  expect(()=>checkBrowserParameter('最新的排前面',{...base,operation:'select',query:'不存在',intent:{source:'最新',kind:'option'}},{name:'排序（升序、降序）'})).toThrow('选项')
  expect(()=>checkBrowserParameter('查考试通知',{...base,query:'无依据'},{name:'搜索'})).toThrow('用户本次')
})
