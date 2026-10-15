import { useLibraryStore } from '../../state/useLibraryStore'
export function BrowserQueryOptions(){
  const settings=useLibraryStore(state=>state.data.companion.browser)
  return <details className="browser-site-options"><summary>查询体验<small>{settings?.foregroundQueries?'前台查询':'后台查询'} · {settings?.confirmQueryEgress?'逐次确认':'自动脱敏'}</small></summary><div className="browser-site-option-body">
    <p className="browser-note">默认在专用最小化窗口查询，不打断日常浏览。你发起的已授权查询会自动脱敏后交给当前模型；不会读取密码，首次授权和必要验证仍需你处理。</p>
    <label className="browser-cached-login"><input type="checkbox" checked={settings?.foregroundQueries===true} onChange={event=>useLibraryStore.getState().setCompanionBrowser({foregroundQueries:event.target.checked})}/><span>在前台显示查询页面<small>需要观察过程时开启；不会更改其他窗口。</small></span></label>
    <label className="browser-cached-login"><input type="checkbox" checked={settings?.confirmQueryEgress===true} onChange={event=>useLibraryStore.getState().setCompanionBrowser({confirmQueryEgress:event.target.checked})}/><span>每次查询前确认脱敏发送<small>开启后恢复逐次确认；识别到的密钥、密码和令牌仍阻止外发。</small></span></label>
  </div></details>
}
