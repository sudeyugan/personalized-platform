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
it('recognizes common filter widgets, date fields and safe dialog dismissal without exposing their values',()=>{
  document.body.innerHTML='<div role="combobox" aria-label="排序"></div><div role="listbox"><div role="option" aria-label="最新优先"></div></div><input type="date" aria-label="开始日期" value="2026-10-01"><div role="dialog"><button aria-label="关闭"></button><button aria-label="确定删除"></button></div><div role="menuitem" aria-label="标记为已读"></div>'
  expect(describeElement(document.querySelector('[role=combobox]')!)).toMatchObject({operation:'invoke'})
  expect(describeElement(document.querySelector('[role=option]')!)).toMatchObject({operation:'invoke'})
  expect(describeElement(document.querySelector('input')!)).toEqual({name:'开始日期',operation:'fill',format:'date'})
  expect(describeElement(document.querySelector('button')!)).toMatchObject({operation:'invoke'})
  expect(describeElement(document.querySelectorAll('button')[1])).toBeNull()
  expect(describeElement(document.querySelector('[role=menuitem]')!)).toBeNull()
})
it('only exposes explicit filter checkboxes/radios, not arbitrary choices or account forms',()=>{
  document.body.innerHTML='<input type="checkbox" aria-label="只看未读"><div role="checkbox" aria-label="筛选状态" aria-checked="true"></div><input type="checkbox" aria-label="订阅邮件"><form method="post"><input type="radio" aria-label="筛选通知"></form>'
  expect(describeElement(document.querySelector('input')!)).toMatchObject({operation:'invoke',checked:false})
  expect(describeElement(document.querySelector('[role=checkbox]')!)).toMatchObject({checked:true})
  expect(describeElement(document.querySelectorAll('input')[1])).toBeNull();expect(describeElement(document.querySelectorAll('input')[2])).toBeNull()
})
it('does not expose account switching or credential autofill fields as filters',()=>{
  vi.stubGlobal('location',{origin:'https://example.com',href:'https://example.com/'})
  try{
    document.body.innerHTML='<select aria-label="账号筛选"><option>用户A</option><option>用户B</option></select><input type="search" aria-label="搜索" autocomplete="username"><button aria-label="查看并切换账户"></button><a href="https://example.com/switch_account">查看未读</a>'
    for(const element of document.querySelectorAll('select,input,button,a'))expect(describeElement(element)).toBeNull()
  }finally{vi.unstubAllGlobals()}
})
