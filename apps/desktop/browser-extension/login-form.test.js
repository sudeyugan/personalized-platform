import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inspectLoginForm } from './login-form.js'

let click
beforeEach(()=>{
  vi.stubGlobal('location',{origin:'https://mail.example.com',href:'https://mail.example.com/login'})
  vi.spyOn(Element.prototype,'getClientRects').mockImplementation(function(){return this.closest('[hidden]')?[]:[{}]})
  document.body.innerHTML='<form method="post" action="https://mail.example.com/auth"><input type="text" autocomplete="username"><input type="password" autocomplete="current-password"><button type="button">登录</button></form>'
  // Browser autofill status is simulated; credential getters intentionally throw.
  const matches=Element.prototype.matches
  vi.spyOn(Element.prototype,'matches').mockImplementation(function(selector){return [':autofill',':-webkit-autofill'].includes(selector)?this.matches('[autocomplete="username"],[autocomplete="current-password"]'):matches.call(this,selector)})
  for(const input of document.querySelectorAll('input'))Object.defineProperty(input,'value',{get(){throw new Error('credential read forbidden')}})
  click=vi.fn();document.querySelector('button').addEventListener('click',click)
})
afterEach(()=>{document.body.innerHTML='';vi.restoreAllMocks();vi.unstubAllGlobals()})
const commit=()=>inspectLoginForm(true,location.href,Date.now()+1000)
describe('fixed cached-login form policy',()=>{
  it('only probes autofill state and submits a unique same-origin login without reading any values',()=>{
    expect(inspectLoginForm()).toEqual({status:'ready'});expect(click).not.toHaveBeenCalled()
    const result=commit();expect(result).toEqual({status:'submitted'});expect(click).toHaveBeenCalledOnce()
    expect(JSON.stringify(result)).not.toMatch(/password|username|credential/)
  })
  it('stops if there is no nonempty-state evidence, even when a credential is saved elsewhere',()=>{
    document.querySelector('input[type=password]').autocomplete='off'
    expect(commit()).toEqual({status:'unfilled'});expect(click).not.toHaveBeenCalled()
  })
  it('accepts already-filled placeholder controls without an autofill marker or reading values',()=>{
    const inputs=[...document.querySelectorAll('input')],matches=Element.prototype.matches
    for(const input of inputs){input.autocomplete='off';input.placeholder='虚构提示'}
    vi.spyOn(Element.prototype,'matches').mockImplementation(function(selector){return selector===':placeholder-shown'?false:matches.call(this,selector)})
    expect(inspectLoginForm()).toEqual({status:'ready'});expect(commit()).toEqual({status:'submitted'});expect(click).toHaveBeenCalledOnce()
    // It is the native empty/nonempty state, not simply having a placeholder.
    vi.spyOn(Element.prototype,'matches').mockImplementation(function(selector){return selector===':placeholder-shown'?true:matches.call(this,selector)})
    expect(commit()).toEqual({status:'unfilled'});expect(click).toHaveBeenCalledOnce()
  })
  it('can use required validity without changing controls or reading credentials',()=>{
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set
    for(const input of document.querySelectorAll('input')){input.autocomplete='off';input.required=true;setter.call(input,'fictional-filled')}
    expect(commit()).toEqual({status:'submitted'});expect(click).toHaveBeenCalledOnce()
    setter.call(document.querySelector('input[type=password]'),'')
    expect(inspectLoginForm()).toEqual({status:'unfilled'})
  })
  it('rechecks emptied credentials at commit rather than replaying ready status',()=>{
    const password=document.querySelector('input[type=password]')
    expect(inspectLoginForm().status).toBe('ready');password.autocomplete='off'
    expect(commit().status).toBe('unfilled');expect(click).not.toHaveBeenCalled()
  })
  it.each(['<input autocomplete="one-time-code">','<input name="captcha">','<iframe src="https://challenge.example.com/recaptcha"></iframe>','<div class="second-auth">二次验证</div>'])('stops visible challenges, not hidden dormant challenge templates: %s',html=>{
    const extra=document.createElement('div');extra.innerHTML=html;document.body.append(extra)
    expect(commit()).toEqual({status:'needs_user'});expect(click).not.toHaveBeenCalled()
    extra.hidden=true;expect(inspectLoginForm()).toEqual({status:'ready'})
  })
  it.each(['https://other.example.com/auth','http://mail.example.com/auth','https://user:pass@mail.example.com/auth','https://mail.example.com:8443/auth'])('rejects cross-origin/insecure/credential-bearing submit target: %s',action=>{
    document.querySelector('form').action=action;expect(commit()).toEqual({status:'needs_user'});expect(click).not.toHaveBeenCalled()
  })
  it('stops GET, new-window target, registration, multiple buttons and multiple accounts',()=>{
    const form=document.querySelector('form'),password=document.querySelector('input[type=password]')
    form.method='get';expect(commit().status).toBe('needs_user');form.method='post'
    form.target='_blank';expect(commit().status).toBe('needs_user');form.target=''
    password.autocomplete='new-password';expect(commit().status).toBe('needs_user');password.autocomplete='current-password'
    form.insertAdjacentHTML('beforeend','<button>登录</button>');expect(commit().status).toBe('needs_user');form.lastChild.remove()
    form.insertAdjacentHTML('beforeend','<input type="email">');expect(commit().status).toBe('needs_user');expect(click).not.toHaveBeenCalled()
  })
  it('does not replay across URL/lease changes and makes no login claims about a normal page',()=>{
    expect(inspectLoginForm(true,'https://mail.example.com/other',Date.now()+1000).status).toBe('changed')
    expect(inspectLoginForm(true,location.href,Date.now()-1).status).toBe('changed');expect(click).not.toHaveBeenCalled()
    document.body.innerHTML='<p>收件箱</p>';expect(inspectLoginForm()).toEqual({status:'none'})
  })
  it('only classifies a visible rejected submit; does not return the page error',()=>{
    const form=document.querySelector('form')
    form.insertAdjacentHTML('beforeend','<div role="alert">密码未输入</div>')
    expect(inspectLoginForm().status).toBe('ready')
    expect(inspectLoginForm('submitted_check')).toEqual({status:'rejected'})
    form.lastChild.hidden=true
    expect(inspectLoginForm('submitted_check')).toEqual({status:'ready'})
  })
  it('binds a trusted target to the same button/document/location and checks occlusion',()=>{
    vi.stubGlobal('innerWidth',800);vi.stubGlobal('innerHeight',600)
    const button=document.querySelector('button')
    vi.spyOn(button,'getBoundingClientRect').mockReturnValue({left:100,top:180,width:80,height:40})
    document.elementFromPoint=vi.fn(()=>button)
    const target=()=>inspectLoginForm('target',location.href,Date.now()+1000)
    const validate=()=>inspectLoginForm('validate_target',location.href,Date.now()+1000)
    expect(target()).toEqual({status:'ready',point:{x:140,y:200}})
    expect(validate()).toEqual({status:'ready',point:{x:140,y:200}})
    expect(click).not.toHaveBeenCalled()
    document.elementFromPoint.mockReturnValue(document.body)
    expect(validate().status).toBe('needs_user')
    document.elementFromPoint.mockReturnValue(button)
    button.getBoundingClientRect.mockReturnValue({left:110,top:180,width:80,height:40})
    expect(validate().status).toBe('changed')
    document.elementFromPoint.mockReturnValue(document.createElement('div'))
    expect(target().status).toBe('needs_user')
    delete globalThis.__yiyuTrustedLoginTarget
  })
})
