import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import { describeElement,pageText } from '../../../../browser-runtime/dom.mjs'
beforeEach(()=>{
  vi.spyOn(Element.prototype,'getBoundingClientRect').mockReturnValue(new DOMRect(0,0,100,20))
  vi.spyOn(Element.prototype,'getClientRects').mockReturnValue([new DOMRect(0,0,100,20)] as unknown as DOMRectList)
})
afterEach(()=>{document.body.innerHTML='';vi.restoreAllMocks()})
it('never copies editable/secret input values into observations and reports visible login',()=>{
  document.body.innerHTML='<p>未读邮件 2</p><input value="PRIVATE-ACCOUNT"><input type="password" value="PRIVATE-SECRET"><textarea>PRIVATE-TEXT</textarea><div contenteditable="true">PRIVATE-EDIT</div><div hidden>PRIVATE-HIDDEN</div>'
  const result=pageText();expect(result.text).toContain('未读邮件 2');expect(result.text).not.toMatch(/PRIVATE/);expect(result.login).toBe(true)
  expect(describeElement(document.querySelector('input')!)).toBeNull()
})
it('keeps known risky buttons, POST forms and credential fields out of normal actions',()=>{
  document.body.innerHTML='<button aria-label="查看并删除邮件">查看并删除邮件</button><button aria-label="发送">发送</button><button aria-label="保存">保存</button><form method="post"><input type="search" aria-label="搜索"><button aria-label="查询">查询</button></form><input type="password" aria-label="查询密码">'
  for(const element of document.querySelectorAll('button,input'))expect(describeElement(element)).toBeNull()
})
it('only exposes semantic low-risk operations, not arbitrary fields or buttons',()=>{
  document.body.innerHTML='<button aria-label="查看未读">查看未读</button><input type="search" aria-label="搜索邮件"><select aria-label="筛选状态"><option>未读</option></select><button aria-label="未知操作">未知操作</button><input aria-label="个人信息">'
  expect(describeElement(document.querySelector('button')!)).toMatchObject({operation:'invoke'})
  expect(describeElement(document.querySelector('input')!)).toMatchObject({operation:'search'})
  expect(describeElement(document.querySelector('select')!)).toMatchObject({operation:'select',options:['未读']})
  expect(describeElement(document.querySelectorAll('button')[1])).toBeNull()
  expect(describeElement(document.querySelectorAll('input')[1])).toBeNull()
})
it('marks an explicit busy page as loading instead of verifying stale text',()=>{
  document.body.innerHTML='<section aria-busy="true">未读 2</section>';expect(pageText().loading).toBe(true)
})
