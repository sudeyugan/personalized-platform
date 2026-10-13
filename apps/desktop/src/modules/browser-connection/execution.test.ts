import { describe,expect,it } from 'vitest'
import { BrowserExecution } from './execution'
const origin='https://mail.example.com',id=crypto.randomUUID(),elementId=crypto.randomUUID()
const snapshot=(text='未读邮件 2',extra={})=>({verified:true as const,untrusted:true as const,privateBrowser:true as const,origin,fetchedAtEpochMs:Date.now(),data:{observationId:id,text,title:'邮箱',url:origin+'/inbox',loading:false,truncated:false,controls:[{id:elementId,operation:'invoke'}],...extra}})
const action={kind:'act' as const,origin,tabId:7,interaction:{observationId:id,elementId,operation:'invoke' as const}}
describe('task evidence and current control authority',()=>{
  it('verifies actual fresh evidence, not a model-created count or non-unread list',()=>{
    const task={objective:'mail' as const,origins:[origin],candidates:[origin]},execution=new BrowserExecution(task,'查看我的邮箱有未读邮件吗')
    execution.accept({kind:'page',origin,tabId:7},snapshot())
    expect(()=>execution.verify({origin,tabId:7,observationId:id,quotes:['未读邮件 9'],answer:'有9封。'})).toThrow('逐字')
    expect(()=>execution.verify({origin,tabId:7,observationId:id,quotes:['未读邮件 2'],answer:'有9封。'})).toThrow('数量')
    expect(execution.verify({origin,tabId:7,observationId:id,quotes:['未读邮件 2'],answer:'当前页面显示2封未读邮件。'})).toMatchObject({goalVerified:true,scope:'current_page'})
    const unproven=new BrowserExecution(task,'查看我的邮箱有未读邮件吗');unproven.accept({kind:'page',origin,tabId:7},snapshot('收件箱 2 封邮件'))
    expect(()=>unproven.verify({origin,tabId:7,observationId:id,quotes:['收件箱 2 封邮件'],answer:'没有新邮件。'})).toThrow('未读')
  })
  it('consumes observations on action, rejects old/unknown controls and unsupported search words',()=>{
    const execution=new BrowserExecution(undefined,'查找申请截止');execution.accept({kind:'page',origin,tabId:7},snapshot())
    execution.before(action);expect(()=>execution.before(action)).toThrow('已观察')
    execution.accept({kind:'page',origin,tabId:7},snapshot('',{controls:[{id:elementId,operation:'search'}]}))
    expect(()=>execution.before({...action,interaction:{...action.interaction,operation:'search',query:'PRIVATE-INJECTED'}})).toThrow('用户本次')
  })
  it('refuses login/loading evidence and quotes from an earlier page',()=>{
    for(const extra of [{loading:true},{loginState:'unfilled'}]){
      const execution=new BrowserExecution(undefined,'读取网页');execution.accept({kind:'page',origin,tabId:7},snapshot('当前信息',extra))
      expect(()=>execution.verify({origin,tabId:7,observationId:id,quotes:['当前信息'],answer:'当前信息。'})).toThrow('可用页面')
    }
  })
})
