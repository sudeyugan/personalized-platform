import { useEffect,useState } from 'react'
import { Globe2,LogIn,ShieldCheck,Square,X } from 'lucide-react'
import { useLibraryStore } from '../../../state/useLibraryStore'
import { browserOrigin,browserPageUrl } from '../../../domain/browser'
import { BrowserSiteProfileFields } from '../BrowserSiteProfileFields'
import { browserNative } from '../native'
import { configureManagedBrowser,stopManagedBrowser,type ManagedBrowserStatus } from './native'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { websiteRole } from '../siteProfile'

export function ManagedBrowserSection(){
  const settings=useLibraryStore(state=>state.data.companion.browser)
  const [status,setStatus]=useState<ManagedBrowserStatus>(),[site,setSite]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const enabled=settings?.enabled===true,sites=settings?.sites??[]
  const [clearSession,setClearSession]=useState(false)
  useEffect(()=>{
    if(!('__TAURI_INTERNALS__' in window))return
    let disposed=false
    const refresh=()=>void browserNative<ManagedBrowserStatus>('managed_browser_status').then(value=>{if(!disposed)setStatus(value)}).catch(()=>{})
    refresh();const timer=window.setInterval(refresh,3000);return()=>{disposed=true;clearInterval(timer)}
  },[])
  const run=async(action:()=>Promise<void>)=>{if(busy)return;setBusy(true);setError('');setNotice('');try{await action()}catch(reason){setError(reason instanceof Error?reason.message:'浏览器操作失败')}finally{setBusy(false)}}
  const login=async(origin:string)=>{
    const state=await configureManagedBrowser(),entry=settings?.profiles?.find(profile=>profile.origin===origin)?.entryUrl??origin
    await browserNative('managed_browser_login',{origin,url:entry,expectedEpoch:state.epoch});setStatus({...state,mode:'login'})
    setNotice('请在小鱼专用浏览器里登录。完成后点“结束登录”，之后查询不会打开窗口。日常Edge登录不会自动继承。')
  }
  const add=()=>{
    const raw=/^https:\/\//u.test(site.trim())?site.trim():`https://${site.trim()}`,url=new URL(raw),origin=browserOrigin(url.origin),entry=browserPageUrl(url.href,origin)
    const current=useLibraryStore.getState().data.companion.browser
    const previous=current?.profiles?.find(profile=>profile.origin===origin)
    useLibraryStore.getState().setCompanionBrowser({sites:[...new Set([...(current?.sites??[]),origin])],interactionSites:[...new Set([...(current?.interactionSites??[]),origin])],profiles:[...(current?.profiles??[]).filter(profile=>profile.origin!==origin),{...previous,origin,role:websiteRole(origin,previous),entryUrl:entry}]})
    setSite('');setNotice('网站已添加。需要账号的网站先点“登录”；公开网站可直接查询。')
  }
  return <details className="permission-scope-group browser-connection" open><summary><span>小鱼专用浏览器</span><small>{!enabled?'未开启':status?.mode==='login'?'正在登录':'无窗口查询'}</small></summary><div className="browser-connection-body">
    <div className="setting-row"><div><strong>安静地浏览与查询</strong><span>使用独立登录，不打扰日常Edge；无需安装扩展。</span></div><button type="button" className={enabled?'switch on':'switch'} aria-label="启用小鱼专用浏览器" aria-pressed={enabled} onClick={()=>useLibraryStore.getState().setCompanionBrowser({enabled:!enabled})}><i/></button></div>
    {enabled&&<>
      <div className="browser-connection-status"><span className="browser-status-dot online"/><span>{status?.mode==='login'?'专用登录窗口已打开':'查询时在后台启动'}</span><button type="button" onClick={()=>void run(async()=>{await stopManagedBrowser();setNotice('已停止专用浏览器，本机登录会话保留。')})}><Square size={12}/>停止</button></div>
      {status?.mode==='login'&&<div className="browser-managed-login"><strong>登录完成后，回到这里继续</strong><p className="browser-note">只在这个窗口中手动输入账号密码或处理验证码，小鱼不会读取这些输入。“结束登录”仅保存本机会话，不代表网站已登录成功。</p><button type="button" disabled={busy} onClick={()=>void run(async()=>{const state=await configureManagedBrowser();await browserNative('managed_browser_finish_login',{expectedEpoch:state.epoch});setStatus({...state,mode:'background'});setNotice('专用窗口已关闭。现在可以让小鱼查询，结果仍以实际页面为准。')})}>结束登录 · 转为后台</button></div>}
      <div className="browser-sites-heading"><strong>已授权网站 <small>{sites.length}</small></strong></div>
      <div className="browser-sites">{sites.map(origin=><div className="browser-site-card" key={origin}><div className="browser-site-top"><span className="browser-site-icon"><Globe2 size={17}/></span><span className="browser-site-name"><strong>{settings?.profiles?.find(profile=>profile.origin===origin)?.label||new URL(origin).hostname}</strong><small>独立本机会话</small></span><button type="button" disabled={busy} onClick={()=>void run(()=>login(origin))}><LogIn size={13}/>登录</button><button type="button" className="browser-site-remove" aria-label={`撤销 ${origin}`} onClick={()=>useLibraryStore.getState().setCompanionBrowser({sites:sites.filter(value=>value!==origin)})}><X size={13}/></button></div><details className="browser-site-options"><summary>网站选项<small>用途、入口与操作范围</small></summary><div className="browser-site-option-body"><BrowserSiteProfileFields site={origin}/></div></details></div>)}</div>
      {!sites.length&&<div className="browser-sites-empty"><Globe2 size={22}/><span>添加常用网站<small>邮箱、通知、学习或其他网页</small></span></div>}
      <form className="browser-add-site" onSubmit={event=>{event.preventDefault();void run(async()=>add())}}><input aria-label="专用浏览器授权网站" value={site} onChange={event=>setSite(event.target.value)} placeholder="网站域名或HTTPS入口链接" autoComplete="off"/><button type="submit" disabled={busy||!site.trim()}>添加并授权浏览</button></form>
      <p className="browser-privacy-note"><ShieldCheck size={14}/><span>专用浏览器会在本机保存敏感登录会话，不放进资料备份，不导出密码或Cookie给模型。网页文字仍按现有隐私设置脱敏后处理；发送、删除、支付不属于普通浏览。需要登录时会提示，不会自行弹窗。</span></p>
      <details className="browser-site-options"><summary>隐私与本机会话<small>仅专用浏览器</small></summary><label className="browser-cached-login"><input type="checkbox" checked={settings?.confirmQueryEgress===true} onChange={event=>useLibraryStore.getState().setCompanionBrowser({confirmQueryEgress:event.target.checked})}/><span>每次发送脱敏结果前确认<small>默认不重复询问已授权网站的明确查询</small></span></label><p className="browser-note">停用或移除网站会立即停止相关访问，但不会自动抹掉登录。清除会退出专用浏览器的所有账号，不影响日常Edge。</p><button type="button" disabled={busy} onClick={()=>setClearSession(true)}>清除专用浏览器登录</button></details>
    </>}
    {notice&&<p className="browser-note" role="status">{notice}</p>}{error&&<p className="browser-note" role="alert">{error}</p>}
    {clearSession&&<ConfirmDialog title="清除专用浏览器登录？" subject="小鱼的独立本机会话" description="将停止专用浏览器并清除其中所有网站的登录、缓存与本机网页数据，无法恢复。已授权网站列表、日常Edge和资料库不会删除。" confirmLabel="确认清除" permanent onCancel={()=>setClearSession(false)} onConfirm={()=>void run(async()=>{await browserNative('managed_browser_clear_session',{confirmed:true});setClearSession(false);setStatus(undefined);setNotice('专用浏览器登录已清除，无法恢复。已授权网站保留，之后可重新登录。')})}/>}
  </div></details>
}
