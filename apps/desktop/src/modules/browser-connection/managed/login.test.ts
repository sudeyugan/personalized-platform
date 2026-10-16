import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import { inspectLogin } from '../../../../browser-runtime/login-dom.mjs'
import { browserLoginReply } from '../queryFlow'
const site='https://mail.example.com'
beforeEach(()=>{
  vi.stubGlobal('location',{origin:site,href:site+'/login'})
  vi.spyOn(Element.prototype,'getClientRects').mockImplementation(function(this:Element){return (this.closest('[hidden]')?[]:[{}]) as unknown as DOMRectList})
  vi.spyOn(Element.prototype,'getBoundingClientRect').mockReturnValue(new DOMRect(0,0,100,30))
  Object.defineProperty(document,'elementFromPoint',{configurable:true,value:()=>document.querySelector('button')})
  document.body.innerHTML=`<form method="post" action="${site}/session"><input type="text" autocomplete="username"><input type="password" autocomplete="current-password"><button>登录</button></form>`
  const matches=Element.prototype.matches
  vi.spyOn(Element.prototype,'matches').mockImplementation(function(this:Element,selector){return [':autofill',':-webkit-autofill'].includes(selector)?matches.call(this,'[autocomplete="username"],[autocomplete="current-password"]'):matches.call(this,selector)})
  for(const input of document.querySelectorAll('input'))Object.defineProperty(input,'value',{get(){throw new Error('credential access forbidden')}})
})
afterEach(()=>{document.body.innerHTML='';delete (document as Partial<Document>).elementFromPoint;vi.restoreAllMocks();vi.unstubAllGlobals()})
it('only returns the unique login button and never reads credentials or clicks during inspection',()=>{
  const click=vi.fn();document.querySelector('button')!.addEventListener('click',click)
  const result=inspectLogin();expect(result.status).toBe('ready');expect(result.button).toBe(document.querySelector('button'))
  expect(click).not.toHaveBeenCalled()
})
it('does not confuse saved credentials with a filled form',()=>{
  document.querySelector('input[type=password]')!.setAttribute('autocomplete','off')
  expect(inspectLogin()).toEqual({status:'unfilled',button:null})
})
it.each(['<input autocomplete="one-time-code">','<input type="password">','<input type="email">','<div class="second-auth">验证码</div>'])('refuses ambiguous/challenged forms: %s',html=>{
  document.querySelector('form')!.insertAdjacentHTML('beforeend',html)
  expect(inspectLogin()).toEqual({status:'needs_user',button:null})
})
it.each(['https://other.com/session','http://mail.example.com/session','https://user:secret@mail.example.com/session'])('never sends credentials to an unrelated/insecure target: %s',action=>{
  document.querySelector('form')!.action=action;expect(inspectLogin().status).toBe('needs_user')
})
it('rejects GET, another-window targets, new passwords, multiple buttons and occlusion',()=>{
  const form=document.querySelector('form')!;form.method='get';expect(inspectLogin().status).toBe('needs_user');form.method='post'
  form.target='_blank';expect(inspectLogin().status).toBe('needs_user');form.target=''
  form.insertAdjacentHTML('beforeend','<button>登录</button>');expect(inspectLogin().status).toBe('needs_user');form.lastChild!.remove()
  Object.defineProperty(document,'elementFromPoint',{configurable:true,value:()=>document.body});expect(inspectLogin().status).toBe('needs_user')
})
it('uses dedicated-browser guidance instead of claiming success or requiring a separate extension',()=>{
  for(const state of ['managed_login','managed_unfilled','managed_needs_user','managed_pending']){
    const reply=browserLoginReply(state)!
    expect(reply).toBeTruthy();expect(reply).not.toMatch(/已完成|可信点击组件|Edge浏览器连接/)
  }
})
