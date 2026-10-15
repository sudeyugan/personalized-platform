import { useEffect, useState } from 'react'
import { Globe2, Link2, Square, ShieldCheck } from 'lucide-react'
import { useLibraryStore } from '../../state/useLibraryStore'
import { browserOrigin } from '../../domain/browser'
import { browserConnectionEnabled } from './authority'
import { browserNative, configureBrowser, type BrowserConnectionStatus } from './native'
import { connectBrowserSites } from './setup'
import { BrowserSiteCard } from './BrowserSiteCard'
import { TrustedClickInstallation } from './TrustedClickInstallation'
import { BrowserRecordingCard } from './recording/BrowserRecordingCard'
import { BrowserQueryOptions } from './BrowserQueryOptions'
import './browser.css'
export function BrowserConnectionSection() {
  const settings = useLibraryStore(state => state.data.companion.browser)
  const trust = useLibraryStore(state => state.data.settings.trust.externalAiProcessing)
  const [status, setStatus] = useState<BrowserConnectionStatus>()
  const [code, setCode] = useState(''), [path, setPath] = useState(''), [site, setSite] = useState(''), [error, setError] = useState('')
  const [busy,setBusy]=useState(false),[openSite,setOpenSite]=useState(true)
  const enabled = settings?.enabled ?? false, sites = settings?.sites ?? []
  const waiting = sites.filter(value => !status?.browserSites.includes(value))
  const blocked = busy || status?.setupPending === true
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return
    let disposed = false
    const refresh = () => { void browserNative<BrowserConnectionStatus>('browser_bridge_status').then(value => { if (!disposed) { setStatus(value); if (value.paired) setCode('') } }).catch(() => undefined) }
    refresh(); const interval = window.setInterval(refresh, 3000)
    return () => { disposed = true; clearInterval(interval) }
  }, [])
  const run = async (action: () => Promise<void>) => { if(busy)return;setBusy(true);setError(''); try { await action() } catch (reason) { setError(reason instanceof Error ? reason.message : '浏览器连接失败') } finally{setBusy(false)} }
  const queue = async(next:string[],target?:string)=>{setStatus(await connectBrowserSites(next,openSite?target:undefined))}
  const addSites = async(next: string[],target?:string) => {
    const current=useLibraryStore.getState().data.companion.browser?.sites??[]
    useLibraryStore.getState().setCompanionBrowser({ sites: [...new Set([...current, ...next])] });setSite('')
    if(status?.paired)await queue(next,target)
    else setError('网站已保存。完成首次扩展安装和配对后，点击网站旁的连接即可在Edge确认，不必重复填写域名。')
  }
  const connect = async () => {
    const current = useLibraryStore.getState().data.companion.browser
    await configureBrowser(browserConnectionEnabled(), current?.sites ?? [], false, current?.cachedLoginSites ?? [],current?.interactionSites??[])
    const value = await browserNative<{code:string}>('browser_bridge_connect'); setCode(value.code)
  }
  return <details className="permission-scope-group browser-connection"><summary><span>Edge 浏览器连接</span><small>{!enabled ? '未开启' : status?.online ? '已在线' : status?.paired ? '已配对 · 等待Edge' : '待连接'}</small></summary>
    <div className="browser-connection-body">
      <div className="setting-row"><div><strong>让小鱼访问已授权网站</strong><span>沿用这个 Edge 的登录状态，网站只在下方添加。</span></div><button type="button" aria-label="允许读取已登录浏览器" aria-pressed={enabled} className={enabled ? 'switch on' : 'switch'} onClick={() => useLibraryStore.getState().setCompanionBrowser({ enabled: !enabled })}><i /></button></div>
      {!trust && <p className="browser-note">外部模型处理当前关闭，AI浏览器查询不会执行；示范学习仍可只在本机记录操作步骤。</p>}
      {enabled && <>
        <div className="browser-connection-status"><span className={`browser-status-dot ${status?.online ? 'online' : ''}`}/><span>{status?.online ? 'Edge 已在线' : status?.paired ? '已配对，等待 Edge 上线' : '先连接 Edge 扩展'}</span>{status?.online && <small>只访问下方网站</small>}</div>
        <details className="browser-install-options" open={!status?.paired}><summary>{status?.paired ? '扩展管理' : '首次连接'}<small>{status?.paired ? '更新、重新配对' : '只需设置一次'}</small></summary><div className="browser-install-body">
        <div className="browser-actions"><button type="button" disabled={busy} onClick={() => void run(async () => setPath(await browserNative<string>('browser_bridge_export')))}><Globe2 size={14} />准备Edge扩展文件</button>{!status?.paired ? <button type="button" disabled={busy} onClick={() => void run(connect)}><Link2 size={14} />生成连接码</button> : <button type="button" disabled={busy} onClick={() => void run(async () => { await browserNative('browser_bridge_disconnect'); setCode(''); setStatus(undefined) })}>断开配对</button>}<button type="button" disabled={busy} onClick={() => void run(async () => { await browserNative('browser_bridge_cancel') })}><Square size={12} />停止读取</button></div>
        <p className="browser-note">在 Edge 打开 edge://extensions → 开发人员模式 → 加载解压缩的扩展，选择下方目录并输入连接码。连接后自动维护，不必每次重新安装。</p>
        {status?.updateRequired&&<p className="browser-note" role="status">扩展需要更新（{status.extensionVersion??'旧版本'} → {status.expectedVersion}）。旧扩展本次需在Edge重新加载一次；之后自动更新。加载了其他目录的副本时，请改用下面的一隅目录。</p>}
        {(path||status?.extensionPath) && <label>扩展目录<input readOnly value={path||status?.extensionPath||''} onFocus={event => event.currentTarget.select()} /></label>}
        {code && <label>连接码（10分钟内有效，请复制到Edge扩展）<input className="browser-code" readOnly value={code} onFocus={event => event.currentTarget.select()} autoComplete="off" /></label>}
        </div></details>
        <TrustedClickInstallation/>
        <BrowserQueryOptions/>
        <div className="browser-sites-heading"><strong>已添加的网站 <small>{sites.length}</small></strong>{sites.length > 0 && <button type="button" disabled={blocked} onClick={() => void run(async()=>{if(!status?.paired)throw new Error('请先完成上方Edge扩展连接，已添加的网站会保留。');const targets=waiting.length?waiting:sites;await queue(targets,targets.length===1?targets[0]:undefined)})}><Link2 size={13}/>连接已添加网站</button>}</div>
        <div className="browser-sites">{sites.map(value => <BrowserSiteCard key={value} site={value} connected={status?.browserSites.includes(value)??false} updateRequired={status?.updateRequired} busy={blocked} onConnect={()=>void run(()=>queue([value],value))}/>)}</div>
        {!sites.length && <div className="browser-sites-empty"><Globe2 size={22}/><span>添加一个常用网站<small>邮箱、学校门户或其他已登录网站</small></span></div>}
        <form className="browser-add-site" onSubmit={event=>{event.preventDefault();void run(async()=>{const value=site.trim();const origin=browserOrigin(/^https?:\/\//u.test(value)?value:`https://${value}`);await addSites([origin],origin)})}}><input aria-label="授权网站域名" value={site} onChange={event => setSite(event.target.value)} placeholder="网站域名，如 mails.tsinghua.edu.cn" autoComplete="off" spellCheck={false}/><button type="submit" disabled={blocked||!site.trim()}>添加并连接</button></form>
        <label className="browser-open-site"><input type="checkbox" checked={openSite} onChange={event=>setOpenSite(event.target.checked)}/>连接后打开目标网站</label>
        <BrowserRecordingCard/>
        {status?.setupPending&&<p className="browser-note" role="status">已发起本次连接，Edge将打开确认页。点击确认即可，不必重复输入域名；取消或超时后可重试。</p>}
        <p className="browser-privacy-note"><ShieldCheck size={14}/><span>不读取 Cookie 或密码。必要网页文字可能交给你配置的模型；自动登录、导航与检索在各网站选项中分别授权，不包含发送、删除或支付。</span></p>
      </>}
      {error && <p role="alert">{error}</p>}
    </div>
  </details>
}
