import { useEffect,useState } from 'react'
import { useLibraryStore } from '../../state/useLibraryStore'
import { browserPageUrl,type BrowserSiteProfile,type BrowserSiteRole } from '../../domain/browser'
import { websiteRole } from './siteProfile'
export function BrowserSiteProfileFields({site}:{site:string}){
  const profile=useLibraryStore(state=>state.data.companion.browser?.profiles?.find(item=>item.origin===site))
  const allowed=useLibraryStore(state=>state.data.companion.browser?.interactionSites?.includes(site)===true)
  const preferred=useLibraryStore(state=>state.data.companion.browser?.preferredSites)
  const browser=useLibraryStore(state=>state.data.companion.browser)
  const [label,setLabel]=useState(profile?.label??''),[entry,setEntry]=useState(profile?.entryUrl??''),[error,setError]=useState('')
  useEffect(()=>{setLabel(profile?.label??'');setEntry(profile?.entryUrl??'')},[profile?.label,profile?.entryUrl])
  const save=(changes:Partial<BrowserSiteProfile>)=>{
    try{
      const current=useLibraryStore.getState().data.companion.browser?.profiles??[]
      const next={origin:site,role:websiteRole(site,profile),...profile,...changes}
      if(next.entryUrl)next.entryUrl=browserPageUrl(next.entryUrl,site)
      const defaults={...useLibraryStore.getState().data.companion.browser?.preferredSites}
      if(changes.role)for(const key of ['mail','portal','general'] as const)if(key!==changes.role&&defaults[key]===site)delete defaults[key]
      useLibraryStore.getState().setCompanionBrowser({profiles:[...current.filter(item=>item.origin!==site),next],preferredSites:defaults});setError('')
    }catch(reason){setError(reason instanceof Error?reason.message:'网站配置无效')}
  }
  const toggle=()=>{
    const current=useLibraryStore.getState().data.companion.browser?.interactionSites??[]
    useLibraryStore.getState().setCompanionBrowser({interactionSites:allowed?current.filter(item=>item!==site):[...current,site]})
  }
  const siteRole=websiteRole(site,profile),role=siteRole==='portal'?'portal':'mail'
  const preferenceRole=Object.entries(preferred??{}).find(([,value])=>value===site)?.[0] as BrowserSiteRole|undefined
  const multiple=browser?.sites.filter(value=>websiteRole(value,browser.profiles?.find(item=>item.origin===value))===siteRole).length!==1
  return <div className="browser-site-profile">
    <label className="browser-cached-login"><input type="checkbox" aria-label={`允许 ${new URL(site).hostname} 页面导航与检索`} checked={allowed} onChange={toggle}/><span>页面导航与检索<small>允许查看分组、翻页和站内搜索</small></span></label>
    <div className="browser-profile-fields"><label>用途<select aria-label={`${new URL(site).hostname} 网站用途`} value={siteRole} onChange={event=>save({role:event.target.value as BrowserSiteRole})}><option value="general">普通网站</option><option value="mail">邮箱</option><option value="portal">通知 / 门户</option></select></label><label>名称<input aria-label={`${new URL(site).hostname} 网站称呼`} value={label} placeholder="可不填" maxLength={60} onChange={event=>setLabel(event.target.value)} onBlur={()=>save({label:label.trim()})}/></label></div>
    {(siteRole==='mail'||siteRole==='portal'||preferenceRole)&&(multiple||preferenceRole)&&<label className="browser-cached-login"><input type="checkbox" aria-label={`${new URL(site).hostname} 默认查询网站`} checked={Boolean(preferenceRole)} onChange={event=>{const current={...useLibraryStore.getState().data.companion.browser?.preferredSites};if(event.target.checked)current[role]=site;else if(preferenceRole)delete current[preferenceRole];useLibraryStore.getState().setCompanionBrowser({preferredSites:current})}}/>{(preferenceRole??role)==='mail'?'默认邮箱':'默认通知 / 门户'}</label>}
    <details className="browser-entry-options"><summary>指定查询入口<small>通常无需设置</small></summary><input aria-label={`${new URL(site).hostname} 查询入口`} value={entry} placeholder={`${site}/`} onChange={event=>setEntry(event.target.value)} onBlur={()=>save({entryUrl:entry.trim()||undefined})}/></details>
    {error&&<small role="alert">{error}</small>}
  </div>
}
