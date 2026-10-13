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
  it('does not mistake a saved/typed credential for browser-autofilled state',()=>{
    document.querySelector('input[type=password]').autocomplete='off'
    expect(commit()).toEqual({status:'unfilled'});expect(click).not.toHaveBeenCalled()
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
})
