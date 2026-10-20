import { useState } from 'react'
import { Cloud, RefreshCw, Link2, ShieldCheck, MonitorSmartphone } from 'lucide-react'
import { conflicts, heads, recoveryBundle } from '@yiyu/sync'
import { createDeviceInvite, disconnectDevice, joinDevice, resolveConflict, syncNow, transport, useDeviceSync } from './runtime'
import './deviceSync.css'
import { HubMigrationSettings } from './HubMigrationSettings'
import { ConfigHandoffPanel } from './config/ConfigHandoffPanel'
import { desktopConfigHandoff } from './config/nativeAdapter'

interface Device { id: string; name: string; revoked: number }
export function DeviceSyncSettings() {
  const { state, busy, error, configError, lastSync } = useDeviceSync()
  const [name, setName] = useState('我的电脑')
  const [raw, setRaw] = useState('')
  const [url, setUrl] = useState('http://127.0.0.1:17839')
  const [first, setFirst] = useState(false)
  const [inherit, setInherit] = useState(true)
  const [invitation, setInvitation] = useState('')
  const [recovery, setRecovery] = useState('')
  const [message, setMessage] = useState('')
  const [working, setWorking] = useState(false)
  const [devices, setDevices] = useState<Device[]>([])
  const action = async (job: () => Promise<unknown>) => {
    setWorking(true); setMessage('')
    try { await job() } catch (e) { setMessage(e instanceof Error ? e.message : '操作未完成。') }
    finally { setWorking(false) }
  }
  const loadDevices = async () => {
    if (!state) return
    const result = await transport(state.config.url, '/v1/devices', state.config.token, {}) as { devices: Device[] }
    setDevices(result.devices)
  }
  return <section className="settings-section device-sync">
    <div className="settings-title"><MonitorSmartphone /><div><h2>让一隅，随你同行</h2><p>每台设备独立保存，连上私人中枢后交换修改。</p></div><span className="sync-badge">多端预览</span></div>
    <div className="sync-intro"><Cloud size={24} /><div><strong>{state ? state.config.name : '你的常开电脑，可以成为中枢'}</strong><p>{state ? state.config.url : '无需 NAS。资料加密同步；兼容 API 配置由已有设备另行批准。浏览器与电脑权限仍各自保留。'}</p></div></div>
    {state ? <>
      <div className="sync-status"><span>{busy ? '正在交换修改…' : error ? '连接暂不可用 · 本机仍可使用' : lastSync ? `最近同步 ${new Date(lastSync).toLocaleTimeString('zh-CN')}` : '已连接 · 等待同步'}</span><small>{state.pending.length} 项待发送 · {conflicts(state).length} 项待核对</small></div>
      <div className="sync-actions"><button disabled={working || busy} onClick={() => void syncNow()}><RefreshCw size={15} />现在同步</button><button disabled={working} onClick={() => void action(async () => setInvitation(await createDeviceInvite()))}><Link2 size={15} />邀请另一台设备</button><button disabled={working} onClick={() => void action(loadDevices)}>设备列表</button></div>
      <HubMigrationSettings current={state.config.url} disabled={working || busy}/>
      <ConfigHandoffPanel client={desktopConfigHandoff(state.config)}/>
      {configError && <p role="status">{configError}</p>}
      {invitation && <div className="sync-secret"><strong>十分钟有效，仅能使用一次</strong><p>含同步密钥，请私下传给自己的设备，不要发到聊天、网盘公共链接或截图分享。</p><textarea readOnly value={invitation} aria-label="设备邀请" /><button onClick={() => setInvitation('')}>收起邀请</button></div>}
      {devices.map(device => <div className="sync-device" key={device.id}><span>{device.name}{device.id === state.config.device ? ' · 此设备' : ''}{device.revoked ? ' · 已撤销' : ''}</span>{device.id !== state.config.device && !device.revoked && <button disabled={working} onClick={() => {
        if (!window.confirm('撤销后此设备无法再同步；它已获得的资料和密钥不会远程消失。确定撤销？')) return
        void action(async () => { await transport(state.config.url, '/v1/revoke', state.config.token, { id: device.id }); await loadDevices() })
      }}>撤销</button>}</div>)}
      {conflicts(state).map(key => <details className="sync-conflict" key={key}><summary>有不同修改 · {key.split('/')[0]}</summary><p>没有覆盖任何分支。查看后选择要继续使用的一版；其他版本仍保留在同步历史。想法手稿可先复制内容另存为新手稿。</p>{heads(state, key).map(version => <div key={version.id}><small>{new Date(version.at).toLocaleString('zh-CN')} · {version.device.slice(0, 8)}</small><pre>{version.value ? String(version.value.title ?? version.value.name ?? version.value.date ?? '') + '\n' + JSON.stringify(version.value, null, 2) : '此版本删除了记录'}</pre><button disabled={working} onClick={() => void action(() => resolveConflict(key, version.id))}>使用这一版</button></div>)}</details>)}
      <details><summary>恢复与连接管理</summary><p>断开只删除此机连接信息，不删除本机资料或中枢历史。请先在安全的离线位置保存管理设备恢复包；它含同步密钥和管理权限，不是给其他设备的一次性邀请。</p>{state.config.recovery && <button onClick={() => setRecovery(recoveryBundle(state))}>显示恢复包</button>}{recovery && <div className="sync-secret"><textarea readOnly value={recovery} aria-label="中枢恢复包"/><button onClick={() => setRecovery('')}>收起恢复包</button></div>}<button disabled={working} onClick={() => { if (window.confirm('确认已有恢复途径，并断开此机？待发送修改不会再上传。')) void action(disconnectDevice) }}>断开此机</button></details>
    </> : <>
      <label>设备名称<input value={name} maxLength={60} onChange={e => setName(e.target.value)} autoComplete="off" /></label>
      <label className="sync-toggle"><input type="checkbox" checked={first} onChange={e => { setFirst(e.target.checked); setRaw('') }} />这是中枢的第一台设备</label>
      {first && <label>中枢地址<input value={url} onChange={e => setUrl(e.target.value)} autoComplete="off" spellCheck={false} /></label>}
      <label>{first ? '中枢初始化时显示的管理凭证' : '另一台设备生成的邀请，或离线保存的恢复包'}<textarea value={raw} onChange={e => setRaw(e.target.value)} autoComplete="off" spellCheck={false} aria-label="连接凭证" /></label>
      <p className="sync-note">连接将合并此机可同步的现有文本资料。相同记录的不同修改会要求核对，不会自动认定哪台较新。</p>
      {!first && <label className="sync-toggle"><input type="checkbox" checked={inherit} onChange={event => setInherit(event.target.checked)}/>连接后申请沿用对话模型配置（需已有设备批准）</label>}
      <button className="primary-button" disabled={working || !raw.trim()} onClick={() => void action(async () => { await joinDevice(raw, name, first ? url : undefined); setRaw(''); const connected = useDeviceSync.getState().state; if (!first && inherit && connected) await desktopConfigHandoff(connected.config)?.request(['model'], true) })}>{working ? '正在连接…' : '连接私人中枢'}</button>
      <details><summary>如何准备常开电脑上的中枢？</summary><p>预览版中枢是独立的 Node24 进程，需要先在选定电脑的项目目录显式初始化并启动。本机测试默认只接受此电脑连接；跨设备还需要你配置受信任的 HTTPS 地址，不会自动开放公网。</p><pre>node apps/sync-hub/src/main.mjs --init --data D:\YiyuHub<br/>node apps/sync-hub/src/main.mjs --data D:\YiyuHub</pre><p>具体配对、网络及恢复限制见项目文档「多端同步预览使用说明」。</p></details>
    </>}
    {(message || error) && <p role="status" className="sync-error">{message || error}</p>}
    <div className="sync-boundary"><ShieldCheck size={17} /><p>中枢保存端到端加密的记录及设备/传输元信息。首版不传附件文件、加密作品、音乐及本机设置；正文中的图片引用可能在另一端缺图。资料在已配对设备上可读，连接信息受本机账户保护而非额外保险箱。同步不是备份。</p></div>
  </section>
}
