import { expect,it } from 'vitest'
import { createSeedLibrary,normalizeLibrary } from '../../domain/seed'
import { companionDesktopSnapshot } from './companionDesktop'

it('restores the bounded saved timeline instead of reducing history to six messages',()=>{
  const data=createSeedLibrary();data.companion.messages=Array.from({length:100},(_,index)=>({id:`fixture-${index}`,role:'user' as const,content:`普通历史${index}`,createdAt:new Date(index*1000).toISOString()}))
  const companion=normalizeLibrary(JSON.parse(JSON.stringify(data))).companion
  expect(companionDesktopSnapshot(companion,'home',false).messages).toHaveLength(100)
  expect(companionDesktopSnapshot(companion,'home',false).messages[0].content).toBe('普通历史0')
})
