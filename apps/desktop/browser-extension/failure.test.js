import { expect,it } from 'vitest'
import { browserFailureCode } from './failure.js'
it('preserves fixed page stages without leaking arbitrary browser or account details',()=>{
  for(const code of ['page_pending','page_open','page_access','permission','tab_changed'])expect(browserFailureCode(new Error(code))).toBe(code)
  expect(browserFailureCode(new DOMException('PRIVATE','TimeoutError'))).toBe('timeout')
  for(const error of [new Error('PRIVATE-ACCOUNT token=secret'),{message:'page_open'},null])expect(browserFailureCode(error)).toBe('failed')
})
