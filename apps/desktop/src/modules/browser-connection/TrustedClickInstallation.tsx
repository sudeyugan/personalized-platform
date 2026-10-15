import { useState } from 'react'
import { browserNative } from './native'
export function TrustedClickInstallation() {
  const [path,setPath]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  return <details className="browser-install-options"><summary>可信登录点击 · 可选组件<small>原只读扩展不增加强权限</small></summary><div className="browser-install-body">
    <p className="browser-note">只有需要真实点击的登录页才需安装。这个独立组件的调试权限本身较强；程序只用于当前授权登录按钮，不读取密码、Cookie、网络、DOM或正文。停用组件即可撤销，不影响原只读扩展。</p>
    <button type="button" disabled={busy} onClick={()=>{setBusy(true);setError('');void browserNative<string>('browser_bridge_export',{trustedClick:true}).then(setPath).catch(reason=>setError(reason instanceof Error?reason.message:'准备组件失败')).finally(()=>setBusy(false))}}>准备可信点击组件文件</button>
    {path&&<><label>可选组件目录<input readOnly value={path} onFocus={event=>event.currentTarget.select()}/></label><p className="browser-note">在 edge://extensions 加载此目录并知情确认权限；然后打开原小鱼扩展弹窗，点击「连接可信点击组件」，再确认连接。只需首次安装，后续同目录自动维护。</p></>}
    {error&&<p role="alert">{error}</p>}
  </div></details>
}
