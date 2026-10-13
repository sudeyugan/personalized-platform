import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { snapshotPage } from './page.js'

beforeEach(()=>{
  vi.stubGlobal('location',{origin:'https://mail.example.com',href:'https://mail.example.com/inbox'})
  vi.spyOn(Element.prototype,'getClientRects').mockImplementation(function(){ return this.closest('[hidden]') ? [] : [{}] })
  document.body.innerHTML='<p>外层邮箱</p>'
})
afterEach(()=>{document.body.innerHTML='';vi.restoreAllMocks();vi.unstubAllGlobals()})
function frame(source, body, hidden=false) {
  const element=document.createElement('iframe');element.setAttribute('src',source);if(hidden)element.setAttribute('hidden','')
  const doc=document.implementation.createHTMLDocument('虚构内页');doc.body.innerHTML=body
  // JSDOM has no layout-dependent innerText; supply the fixture's rendered text.
  for(const link of doc.querySelectorAll('a'))Object.defineProperty(link,'innerText',{value:link.textContent})
  Object.defineProperty(doc,'URL',{value:source.startsWith('https://')||source==='about:srcdoc'?source:'about:blank'})
  Object.defineProperty(doc,'baseURI',{value:source.startsWith('https://')?source:'https://mail.example.com/mail/'})
  Object.defineProperty(doc,'readyState',{value:'complete'})
  Object.defineProperty(element,'contentDocument',{value:doc});document.body.append(element);return doc
}
describe('bounded visible same-site frame compatibility',()=>{
  it('reads a same-site inbox, excludes credentials/fields/private nodes, and preserves the top origin',()=>{
    frame('https://mail.example.com/mail/inbox','<p>未读邮件 2</p><input value="PRIVATE-PASSWORD"><form><p>PRIVATE-FORM</p></form><p data-private>PRIVATE-BODY</p><p>token=PRIVATE-TOKEN</p><a href="message">虚构主题</a>')
    const result=snapshotPage()
    expect(result.text).toContain('未读邮件 2');expect(result.text).not.toMatch(/PRIVATE-PASSWORD|PRIVATE-FORM|PRIVATE-BODY|PRIVATE-TOKEN/)
    expect(result.origin).toBe('https://mail.example.com');expect(result.url).toBe('https://mail.example.com/inbox')
    expect(result.links).toEqual([{text:'虚构主题',url:'https://mail.example.com/mail/message'}])
  })
  it('never reads cross-origin or hidden frames, including another granted provider',()=>{
    frame('https://other.example.com/inbox','<p>PRIVATE-OTHER-ACCOUNT</p>')
    frame('https://mail.example.com/mail/hidden','<p>PRIVATE-HIDDEN</p>',true)
    expect(snapshotPage().text).not.toMatch(/PRIVATE-OTHER-ACCOUNT|PRIVATE-HIDDEN/)
  })
  it('supports SOP-readable inline frame documents and skips malformed links',()=>{
    frame('about:srcdoc','<p>同站内嵌未读 1</p><a href="https://[invalid">无效链接</a>')
    const result=snapshotPage();expect(result.text).toContain('同站内嵌未读 1');expect(result.links).toEqual([])
  })
  it('bounds all frame documents and shared text, reporting incomplete coverage',()=>{
    for(let index=0;index<5;index++)frame(`https://mail.example.com/mail/${index}`,`<p>虚构内页${index}</p>`)
    let result=snapshotPage();expect(result.text).toContain('虚构内页2');expect(result.text).not.toContain('虚构内页3');expect(result.truncated).toBe(true)
    document.body.innerHTML='';frame('https://mail.example.com/mail/inbox',`<p>${'字'.repeat(13000)}</p>`)
    result=snapshotPage();expect(result.text.length).toBeLessThanOrEqual(12000);expect(result.truncated).toBe(true)
  })
})
