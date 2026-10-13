import { expect,it } from 'vitest'
import type { CompanionMessage } from '../../domain/models'
import { isLegacyBrowserSummary } from './browserHistorySummary'
import { conversationMessages } from './conversationMessages'
import { companionDesktopSnapshot } from './companionDesktop'
import { createSeedLibrary,normalizeLibrary } from '../../domain/seed'

it('hides restored legacy receipts in both timelines without deleting ordinary local chat',()=>{
  const make=(id:string,content:string):CompanionMessage=>({id,content,role:'companion',createdAt:'2026-10-13T02:00:00Z',localOnly:true})
  const receipts=[make('summary-transient-user','已授权浏览器查询（隐私摘要）'),make('summary-transient-answer','本次查询回合已结束。私人网页内容未保存，重新查询可查看最新结果。')]
  const ordinary=make('normal','已授权浏览器查询（隐私摘要）'),ritual=make('ritual','今日大吉'),other=make('summary-transient-other','正常本地消息')
  const data=createSeedLibrary();data.companion.messages=[ordinary,...receipts,ritual,other]
  const restored=normalizeLibrary(JSON.parse(JSON.stringify(data))).companion
  expect(receipts.every(isLegacyBrowserSummary)).toBe(true)
  expect(isLegacyBrowserSummary({...receipts[0],localOnly:false})).toBe(false)
  expect(conversationMessages(restored.messages,[])).toEqual([ordinary,ritual,other])
  expect(companionDesktopSnapshot(restored,'home',false).messages).toEqual([ordinary,ritual,other])
  const live=make('transient-live','当前查询结果')
  expect(conversationMessages(restored.messages,[live])).toEqual([ordinary,ritual,other,live])
  expect(restored.messages).toHaveLength(5)
})
