// Runs in a named CDP isolated world, never the page's JavaScript world.
// Only fixed cues leave this closure; no input values, HTML or body text.
export function installRecorder(key,site,binding){
  if(location.origin!==site||window!==top)return
  if(!document.documentElement){document.addEventListener('DOMContentLoaded',()=>installRecorder(key,site,binding),{once:true});return}
  const old=globalThis[key];if(old)return
  if(typeof globalThis[binding]!=='function')throw new Error('BROWSER_RECORD_UNAVAILABLE')
  let phase='recording',expires=Date.now()+4500,lastClick
  const host=document.createElement('div');host.setAttribute('data-yiyu-recording','')
  Object.assign(host.style,{position:'fixed',right:'16px',bottom:'16px',zIndex:'2147483647'})
  const shadow=host.attachShadow({mode:'closed'}),panel=document.createElement('div'),label=document.createElement('span')
  Object.assign(panel.style,{font:'13px "Microsoft YaHei",sans-serif',color:'#faf4eb',background:'#69574b',padding:'12px',borderRadius:'12px',boxShadow:'0 4px 20px #0003',display:'flex',gap:'8px',alignItems:'center'})
  panel.append(label);shadow.append(panel);document.documentElement.append(host)
  const visible=node=>node?.isConnected&&node.getClientRects().length>0&&!node.closest('[hidden],[inert],[aria-hidden="true"]')&&getComputedStyle(node).visibility!=='hidden'&&getComputedStyle(node).display!=='none'&&getComputedStyle(node).opacity!=='0'
  const push=value=>globalThis[binding](JSON.stringify(value))
  const ready=()=>Date.now()<expires&&visible(host)&&phase!=='review'
  const update=()=>{label.textContent=phase==='paused'?'示范已暂停':'正在示范 · 不录屏';pause.textContent=phase==='paused'?'继续':'暂停'}
  let pause
  for(const [action,text]of [['pause','暂停'],['stop','停止'],['cancel','丢弃']]){
    const button=document.createElement('button');button.textContent=text
    Object.assign(button.style,{font:'inherit',color:'inherit',background:'#ffffff18',border:'1px solid #ffffff35',borderRadius:'6px',padding:'5px 8px',cursor:'pointer'})
    button.addEventListener('click',event=>{if(!event.isTrusted||!ready())return;const value=action==='pause'&&phase==='paused'?'resume':action;push({action:value});phase=value==='pause'?'paused':value==='resume'?'recording':'review';update()})
    panel.append(button);if(action==='pause')pause=button
  }
  const labels=[['inbox','收件箱','inbox'],['unread','未读','unread'],['all','全部','all'],['notifications','通知','notifications'],['updates','动态','updates'],['following','我的关注','following'],['next','下一页','next'],['previous','上一页','previous'],['refresh','刷新','refresh'],['search','搜索','search']]
  const cue=node=>{
    const label=String(node.getAttribute('aria-label')||node.getAttribute('title')||[...node.childNodes].slice(0,4).filter(child=>child.nodeType===3).map(child=>child.data.slice(0,48)).join('')).slice(0,64).replace(/\s+/g,'').toLowerCase()
    if(/发送|删除|支付|购买|转账|send|delete|pay|purchase|logout|退出/iu.test(label))return
    return labels.find(([, ...names])=>names.some(text=>label===text||label.startsWith(text)&&/^[\d()（）]+$/u.test(label.slice(text.length))))?.[0]??(node.getAttribute('role')==='tab'?'unknown_tab':'unknown_button')
  }
  const emit=(event,value)=>{
    if(event.type==='submit'&&lastClick?.cue===value&&Date.now()-lastClick.at<500){lastClick=undefined;return}
    if(event.type==='click')lastClick={cue:value,at:Date.now()}
    push({action:'event',cue:value})
  }
  const record=event=>{
    if(!ready()||phase!=='recording'||!event.isTrusted||event.composedPath().includes(host))return
    const node=event.target instanceof Element?event.target.closest('button,a[href],[role="button"],[role="tab"],form'):null
    if(!visible(node))return
    const form=node.closest('form')
    if(form){
      if(form.querySelector('input[type="password"]'))emit(event,'manual_auth')
      else if(form.method.toLowerCase()==='get'&&form.querySelector('input[type="search"],input[name="q"],input[name="query"]'))emit(event,'search')
      return
    }
    if(event.type!=='click')return
    const value=cue(node)
    if(value)emit(event,value);else{phase='paused';push({action:'pause'});update()}
  }
  const close=()=>{clearInterval(timer);document.removeEventListener('click',record,true);document.removeEventListener('submit',record,true);host.remove();delete globalThis[key]}
  globalThis[key]={poll(nextPhase){if(!ready()){close();return [{action:'stop'}]}phase=nextPhase;expires=Date.now()+4500;update();return []},close}
  document.addEventListener('click',record,true);document.addEventListener('submit',record,true);update()
  const timer=setInterval(()=>{if(Date.now()>=expires||!visible(host))close()},500)
}
