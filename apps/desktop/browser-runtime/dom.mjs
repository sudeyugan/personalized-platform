// This fixed browser-side function never reads input values or page storage.
// Page text is untrusted. References live in the executor, never page globals.
export function describeElement(element) {
  const visible = node => { const box=node.getBoundingClientRect(), style=getComputedStyle(node); return box.width>0 && box.height>0 && style.visibility!=='hidden' && style.display!=='none' }
  const clean = text => String(text??'').replace(/\s+/g,' ').trim().slice(0,100)
  if (!element.isConnected || !visible(element) || element.closest('[hidden],[inert],[aria-hidden="true"]') || element.disabled) return null
  const tag=element.tagName.toLowerCase(), type=(element.getAttribute('type')??'').toLowerCase()
  const labelled=(element.getAttribute('aria-labelledby')??'').split(/\s+/).slice(0,4).map(id=>document.getElementById(id)?.textContent??'').join(' ')
  const name=clean(element.getAttribute('aria-label') || labelled.trim() || element.labels?.[0]?.innerText || (tag==='input'?element.getAttribute('placeholder'):element.innerText) || element.getAttribute('title'))
  const hint=`${name} ${element.getAttribute('name')??''} ${element.getAttribute('autocomplete')??''}`
  if(/账号|账户|切换用户|选择用户|切换身份|account|username|credential|current-password|new-password|profile/i.test(hint))return null
  if (/password|passwd|密码|验证码|otp|one-time|credit|银行卡|身份证|token|secret|登录|登入|sign.?in|log.?in|发送|提交|保存|删除|清空|购买|支付|转账|授权|同意|退出|注销|订阅|退订|修改|编辑|上传|下载|转发|回复|标为|标记|subscribe|send|submit|save|delete|remove|purchase|pay|logout|sign.?out|upload|download|reply|forward|mark.?as|edit/i.test(hint) || element.closest('[contenteditable="true"]')) return null
  if (tag==='a') {
    if (element.hasAttribute('download')) return null
    try {const url=new URL(element.href);if(url.origin!==location.origin || url.protocol!=='https:' || url.username || url.password || /logout|delete|remove|unsubscribe|purchase|payment|transfer|switch[_/-]?(?:account|user)|impersonat|reset[_/-]?password|支付|删除|转账/i.test(url.href))return null
      return {name:name||'查看链接',operation:'invoke',href:url.href,...(element.target==='_blank'?{opensTab:true}:{})}
    } catch {return null}
  }
  const role=element.getAttribute('role')??'',options=role==='option'&&element.closest('[role="listbox"]')
  if(tag==='input'&&['checkbox','radio'].includes(type)||['checkbox','radio'].includes(role)){
    const form=element.closest('form')
    if(!/(?:筛选|过滤|只看|filter)/i.test(hint)||form&&(form.method.toLowerCase()!=='get'||form.querySelector('input[type="password"]')))return null
    return {name,operation:'invoke',checked:tag==='input'?element.checked:element.getAttribute('aria-checked')==='true'}
  }
  if (tag==='button' || ['button','tab','menuitem','combobox','option'].includes(role) || ['button','submit'].includes(type)) {
    const dismiss=element.closest('[role="dialog"],dialog')&&/^(?:关闭|取消|返回|close|cancel|back)$/i.test(name)
    if (!options&&!dismiss&&!/(?:查看|浏览|收件|未读|已读|通知|公告|课程|作业|日程|动态|关注|直播|下一|上一|更多|展开|收起|搜索|查询|筛选|排序|时间|日期|全部|最新|最早|刷新|view|inbox|unread|next|previous|more|expand|collapse|search|filter|sort|date|refresh)/i.test(name)) return null
    const form=element.closest('form')
    if (form && (form.method.toLowerCase()!=='get' || form.querySelector('input[type="password"]'))) return null
    return {name,operation:'invoke'}
  }
  if ((tag==='input' && ['','text','search','date','month'].includes(type)) || tag==='select') {
    const form=element.closest('form')
    if (form?.querySelector('input[type="password"]') || form && form.method.toLowerCase()!=='get') return null
    if (!/(?:搜索|查找|查询|筛选|排序|起始|开始|结束|截止|日期|月份|search|query|filter|keyword|sort|start|end|date|month)/i.test(hint)) return null
    if(tag==='select') return {name,operation:'select',options:Array.from(element.options).slice(0,20).map(option=>clean(option.textContent))}
    return {name,operation:type==='search' || /搜索|search|查找|查询/i.test(hint)?'search':'fill',...(['date','month'].includes(type)?{format:type}:{})}
  }
  return null
}
export function pageText() {
  const body=document.body
  if (!body) return {text:'',truncated:false,login:false,loading:true}
  // Clone visible text nodes only, excluding editable/secret/script content.
  const walker=document.createTreeWalker(body,NodeFilter.SHOW_TEXT), parts=[]
  let node, size=0, budget=0, truncated=false
  while ((node=walker.nextNode()) && budget++<20000) {
    const parent=node.parentElement
    if(!parent || parent.closest('script,style,noscript,template,input,textarea,select,[contenteditable], [hidden],[inert],[aria-hidden="true"]'))continue
    const style=getComputedStyle(parent)
    if(style.visibility==='hidden'||style.display==='none'||!parent.getClientRects().length)continue
    const text=node.textContent.replace(/\s+/g,' ').trim()
    if(!text)continue
    parts.push(text);size+=text.length+1
    if(size>=12000){truncated=true;break}
  }
  const password=Array.from(document.querySelectorAll('input[type="password"]')).some(input=>input.getClientRects().length>0)
  const busy=Array.from(document.querySelectorAll('[aria-busy="true"]')).slice(0,60).some(node=>node.getClientRects().length>0)
  return {text:parts.join('\n').slice(0,12000),truncated:truncated||budget>=20000,login:password,loading:document.readyState!=='complete'||busy}
}
