// Self-contained ISOLATED world. References/DOM nodes stay in this tab only.
export function observeControls() {
  const visible=node=>Boolean(node.isConnected&&!node.closest('[hidden],[aria-hidden="true"],[data-private]')&&node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden')
  const label=node=>(node.getAttribute('aria-label')??node.getAttribute('title')??node.textContent??'').replace(/\s+/g,' ').trim().slice(0,100)
  const blocked=/发送|提交|删除|清空|支付|购买|付款|下载|上传|授权|密码|登录|登出|退出|注册|保存|修改|编辑|取消订单|退订|unsubscribe|delete|remove|send|submit|pay|buy|checkout|download|upload|login|sign.?in|logout|register|save|edit|confirm|accept/i
  const navigation=/^(?:未读(?:邮件)?|全部(?:邮件|通知|消息)?|收件箱|通知|公告|消息|动态|关注|视频|投稿|下一页|上一页|返回|展开|收起|更多|查看(?:详情|通知|公告|动态)|inbox|unread|all|notifications?|messages?|next|previous|back|more|expand|collapse)$/i
  const references=new Map(),controls=[],observationId=crypto.randomUUID()
  const nodes=[...document.querySelectorAll('a[href],button,[role="tab"],input[type="search"],[role="searchbox"]')].slice(0,500)
  for(const node of nodes){
    if(controls.length>=60)break
    if(!visible(node)||node.disabled||node.getAttribute('aria-disabled')==='true')continue
    let name=label(node),operation='invoke'
    if(blocked.test(name)||node.closest('form')&&node.tagName!=='INPUT')continue
    if(node.tagName==='INPUT'){
      const form=node.form
      if(node.type!=='search'||!form||form.method.toLowerCase()!=='get'||form.querySelector('input[type="password"],textarea,[contenteditable],input[name*="token" i],input[name*="password" i]'))continue
      if([...form.querySelectorAll('input,select')].some(input=>input!==node&&!['hidden','button','submit','checkbox'].includes(input.type)))continue
      try{const url=new URL(form.action);if(url.protocol!=='https:'||url.origin!==location.origin||url.username||url.password||url.port||blocked.test(url.href)||!['','_self'].includes(form.target))continue}catch{continue}
      operation='search';name=name||'站内搜索'
    }else if(node.tagName==='A'){
      if(node.hasAttribute('download')||!['','_self'].includes(node.target)||!name)continue
      try{const url=new URL(node.href);if(url.protocol!=='https:'||url.origin!==location.origin||url.username||url.password||url.port||blocked.test(url.href)||/\.(?:exe|msi|zip|rar|7z|tar|gz|docx?|xlsx?)$/i.test(url.pathname)||[...url.searchParams.keys()].some(key=>/token|password|auth|session|sid/i.test(key)))continue}catch{continue}
    }else if(!navigation.test(name))continue
    if(!name)continue
    const id=crypto.randomUUID(),fingerprint=[node.tagName,label(node),node.href,node.target,node.hasAttribute('download'),node.getAttribute('type'),node.form?.action,node.form?.method].join('|')
    references.set(id,{node,fingerprint,operation});controls.push({id,name,operation})
  }
  globalThis.__yiyuBrowserObservation={observationId,references,url:location.href,expires:Date.now()+60000}
  return {observationId,controls}
}
export function actOnControl(action) {
  const snapshot=globalThis.__yiyuBrowserObservation
  if(!snapshot||snapshot.observationId!==action.observationId||snapshot.url!==location.href||snapshot.expires<Date.now())return {actionStatus:'stale'}
  // Consume even a failed attempt: no replay of possibly dispatched writes.
  delete globalThis.__yiyuBrowserObservation
  const item=snapshot.references.get(action.elementId),node=item?.node
  if(!node?.isConnected||node.disabled||node.getAttribute('aria-disabled')==='true'||!node.getClientRects().length||getComputedStyle(node).visibility==='hidden')return {actionStatus:'stale'}
  const label=(node.getAttribute('aria-label')??node.getAttribute('title')??node.textContent??'').replace(/\s+/g,' ').trim().slice(0,100)
  const fingerprint=[node.tagName,label,node.href,node.target,node.hasAttribute('download'),node.getAttribute('type'),node.form?.action,node.form?.method].join('|')
  if(fingerprint!==item.fingerprint||action.operation!==item.operation)return {actionStatus:'stale'}
  if(item.operation==='search'){
    if(typeof action.query!=='string'||!action.query.trim()||action.query.length>200)return {actionStatus:'blocked'}
    const form=node.form
    try{const url=new URL(form.action);if(form.method.toLowerCase()!=='get'||url.protocol!=='https:'||url.origin!==location.origin||url.username||url.password||url.port||!['','_self'].includes(form.target)||form.querySelector('input[type="password"],textarea,[contenteditable],input[name*="token" i],input[name*="password" i]')||[...form.querySelectorAll('input,select')].some(input=>input!==node&&!['hidden','button','submit','checkbox'].includes(input.type)))return {actionStatus:'blocked'}}catch{return {actionStatus:'blocked'}}
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,action.query)
    node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}))
    form.requestSubmit()
  }else node.click()
  return {actionStatus:'dispatched'}
}
