import { Globe2, Mail, PanelsTopLeft, X } from 'lucide-react'
import { useLibraryStore } from '../../state/useLibraryStore'
import { BrowserSiteProfileFields } from './BrowserSiteProfileFields'
import { websiteRole } from './siteProfile'
export function BrowserSiteCard({ site, connected, updateRequired, busy, onConnect }: { site:string; connected:boolean; updateRequired?:boolean; busy:boolean; onConnect():void }) {
  const allowed = useLibraryStore(state => state.data.companion.browser?.cachedLoginSites?.includes(site) === true)
  const navigation = useLibraryStore(state => state.data.companion.browser?.interactionSites?.includes(site) === true)
  const profile = useLibraryStore(state => state.data.companion.browser?.profiles?.find(item => item.origin === site))
  const role = websiteRole(site, profile), Icon = role === 'mail' ? Mail : role === 'portal' ? PanelsTopLeft : Globe2
  const setLogin = (enabled:boolean) => {
    const current=useLibraryStore.getState().data.companion.browser?.cachedLoginSites??[]
    useLibraryStore.getState().setCompanionBrowser({cachedLoginSites:enabled?[...new Set([...current,site])]:current.filter(item=>item!==site)})
  }
  return <div className="browser-site-card">
    <div className="browser-site-top"><span className="browser-site-icon"><Icon size={17}/></span><span className="browser-site-name"><strong>{profile?.label || new URL(site).hostname}</strong><small>{profile?.label ? new URL(site).hostname : role === 'mail' ? '邮箱' : role === 'portal' ? '通知 / 门户' : '网站'}</small></span><span className={`browser-site-state ${connected && !updateRequired ? 'connected' : ''}`}>{updateRequired?'待更新':connected?'已连接':'待确认'}</span>{!connected && <button type="button" disabled={busy} onClick={onConnect}>连接</button>}<button className="browser-site-remove" type="button" aria-label={`撤销 ${site}`} title="移除网站并撤销权限" onClick={()=>useLibraryStore.getState().setCompanionBrowser({sites:(useLibraryStore.getState().data.companion.browser?.sites??[]).filter(item=>item!==site)})}><X size={13}/></button></div>
    <details className="browser-site-options"><summary>网站选项<small>{allowed?'可用已填凭据登录':navigation?'可导航与检索':'仅浏览'}</small></summary>
      <div className="browser-site-option-body">
        <label className="browser-cached-login"><input type="checkbox" aria-label={`允许 ${new URL(site).hostname} 用已填凭据登录`} checked={allowed} onChange={event=>setLogin(event.target.checked)}/><span>自动登录<small>仅提交浏览器已填好的凭据，不读取密码</small></span></label>
        <BrowserSiteProfileFields site={site}/>
        {connected && <button type="button" disabled={busy} onClick={onConnect}>重新确认网站连接</button>}
      </div>
    </details>
  </div>
}
