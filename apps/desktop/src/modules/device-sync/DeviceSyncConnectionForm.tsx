import { useState } from 'react'
import { ArrowRight } from 'lucide-react'

type ConnectionKind = 'cloud' | 'invite' | 'selfHosted' | 'recovery'
export interface DeviceConnectionInput {
  name: string
  credential: string
  url?: string
  inherit: boolean
}
interface ConnectionProps {
  working: boolean
  onConnect: (input: DeviceConnectionInput) => Promise<boolean>
}

function ConnectionFields({ kind, working, onConnect }: ConnectionProps & { kind: ConnectionKind }) {
  const [name, setName] = useState('我的电脑')
  const [credential, setCredential] = useState('')
  const [url, setUrl] = useState(kind === 'selfHosted' ? 'http://127.0.0.1:17839' : '')
  const [inherit, setInherit] = useState(true)
  const first = kind === 'cloud' || kind === 'selfHosted'
  const labels = {
    cloud: { credential: '连接凭证', hint: '部署一隅服务时生成，不是云服务器的登录密码', button: '连接云端' },
    invite: { credential: '设备邀请', hint: '从已连接设备的「邀请另一台设备」获取', button: '使用邀请连接' },
    selfHosted: { credential: '管理凭证', hint: '自托管服务初始化时生成，仅用于首次连接', button: '连接自托管服务' },
    recovery: { credential: '恢复包', hint: '仅使用你此前离线保存的管理设备恢复包', button: '恢复设备连接' },
  }[kind]
  return <div className="sync-connect-form">
    <label className="sync-field"><span><strong>设备名称</strong><small>方便在其他设备上认出它</small></span><input aria-label="设备名称" value={name} maxLength={60} onChange={event => setName(event.target.value)} autoComplete="off" /></label>
    {first && <label className="sync-field"><span><strong>{kind === 'cloud' ? '云端服务地址' : '自托管服务地址'}</strong><small>{kind === 'cloud' ? '使用部署后配置好的 HTTPS 地址' : '本机地址仅供此电脑测试；跨设备仍需 HTTPS'}</small></span><input aria-label={kind === 'cloud' ? '云端服务地址' : '自托管服务地址'} value={url} onChange={event => setUrl(event.target.value)} placeholder="https://你的一隅服务地址" autoComplete="off" spellCheck={false} /></label>}
    <label className="sync-field sync-credential"><span><strong>{labels.credential}</strong><small>{labels.hint}</small></span><textarea value={credential} onChange={event => setCredential(event.target.value)} placeholder={`在此粘贴${labels.credential}`} autoComplete="off" spellCheck={false} aria-label="连接凭证" /></label>
    {!first && <label className="sync-toggle"><input type="checkbox" checked={inherit} onChange={event => setInherit(event.target.checked)}/><span><strong>申请沿用对话模型配置</strong><small>需已有设备批准，不会自动复制权限或浏览器登录。</small></span></label>}
    <div className="sync-connect-footer"><p className="sync-note">连接后合并可同步的文本资料；不同修改会保留分支，等你核对。</p><button className="primary-button" disabled={working || !credential.trim() || (first && !url.trim())} onClick={() => {
      void onConnect({ name, credential, url: first ? url : undefined, inherit: !first && inherit }).then(joined => { if (joined) setCredential('') })
    }}>{working ? '正在连接…' : labels.button}<ArrowRight size={14} /></button></div>
  </div>
}

export function DeviceSyncConnectionForm(props: ConnectionProps) {
  const [mode, setMode] = useState<'cloud' | 'invite'>('cloud')
  return <>
    <div className="sync-connect-tabs" role="group" aria-label="云端连接方式">
      <button type="button" aria-pressed={mode === 'cloud'} onClick={() => setMode('cloud')}>首次连接云端</button>
      <button type="button" aria-pressed={mode === 'invite'} onClick={() => setMode('invite')}>使用设备邀请</button>
    </div>
    <ConnectionFields key={mode} kind={mode} {...props}/>
    <details className="sync-advanced"><summary>高级连接选项</summary>
      <p>以下用于自托管、本机测试或恢复，不影响默认的云端连接方式。</p>
      <details><summary>自托管与本机测试</summary><p>仅首次连接自托管服务时使用。已有服务请勿重新初始化；本机地址不能用于手机。</p><ConnectionFields kind="selfHosted" {...props}/></details>
      <details><summary>使用恢复包连接</summary><p>恢复包含同步密钥和管理权限，请仅在自己的设备上使用，不要发到聊天或公开分享。</p><ConnectionFields kind="recovery" {...props}/></details>
      <details><summary>部署与测试说明</summary><p>云端需要先在已购买的服务器上部署一隅服务，再配置受信任的 HTTPS 地址。只购买服务器不会自动开通连接；具体步骤见项目文档「M13 云中枢部署与迁址」。</p><p>如需在电脑本机测试，可显式启动独立的 Node24 进程，默认仅接受此电脑连接，不会自动开放公网。下面的初始化命令仅用于全新的服务；已有资料请勿重新初始化。</p><pre>node apps/sync-hub/src/main.mjs --init --data D:\YiyuHub<br/>node apps/sync-hub/src/main.mjs --data D:\YiyuHub</pre></details>
    </details>
  </>
}
