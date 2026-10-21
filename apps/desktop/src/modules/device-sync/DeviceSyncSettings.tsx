import { useState } from 'react'
import { Cloud, RefreshCw, Link2, ShieldCheck, MonitorSmartphone } from 'lucide-react'
import { conflicts, heads, recoveryBundle } from '@yiyu/sync'
import { createDeviceInvite, disconnectDevice, joinDevice, resolveConflict, syncNow, transport, useDeviceSync } from './runtime'
import './deviceSync.css'
import { HubMigrationSettings } from './HubMigrationSettings'
import { ConfigHandoffPanel } from './config/ConfigHandoffPanel'
import { desktopConfigHandoff } from './config/nativeAdapter'
import { DeviceSyncConnectionForm, type DeviceConnectionInput } from './DeviceSyncConnectionForm'

interface Device { id: string; name: string; revoked: number }
export function DeviceSyncSettings() {
  const { state, busy, error, configError, lastSync } = useDeviceSync()
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
  const connectDevice = async (input: DeviceConnectionInput) => {
    let joined = false
    await action(async () => {
      await joinDevice(input.credential, input.name, input.url)
      joined = true
      const connected = useDeviceSync.getState().state
      if (input.inherit && connected) await desktopConfigHandoff(connected.config)?.request(['model'], true)
    })
    return joined
  }
  const conflictKeys = state ? conflicts(state) : []
  return <section className="settings-section device-sync">
    <div className="settings-title"><MonitorSmartphone /><div><h2>让一隅，随你同行</h2><p>连接自己的云端，让手机与电脑加密接续日常。</p></div><span className="sync-badge">多端预览</span></div>
    <div className="sync-intro"><span className="sync-intro-icon"><Cloud size={20} /></span><div><strong>{state ? state.config.name : '云端连接'}</strong><p>{state ? `当前服务：${state.config.url}` : '使用云服务器上的一隅服务，无需另留一台常开电脑。已有设备连接过？使用它的邀请即可。'}</p></div><span className={`sync-connection${state ? error ? ' is-error' : ' is-connected' : ''}`}><i aria-hidden="true" />{state ? error ? '连接待检查' : '已连接' : '尚未连接'}</span></div>
    {state ? <>
      <div className="sync-status" role="status"><div><small>同步状态</small><strong>{busy ? '正在交换修改…' : error ? '暂不可用 · 本机仍可使用' : lastSync ? `最近同步 ${new Date(lastSync).toLocaleTimeString('zh-CN')}` : '等待首次同步'}</strong></div><div><small>待发送</small><strong>{state.pending.length}<span>项修改</span></strong></div><div><small>待核对</small><strong>{conflictKeys.length}<span>项分歧</span></strong></div></div>
      <div className="sync-actions"><button className="primary-button" disabled={working || busy} onClick={() => void syncNow()}><RefreshCw size={14} className={busy ? 'sync-spinning' : undefined} />现在同步</button><button disabled={working} onClick={() => void action(async () => setInvitation(await createDeviceInvite()))}><Link2 size={14} />邀请另一台设备</button><button disabled={working} onClick={() => void action(loadDevices)}><MonitorSmartphone size={14} />设备列表</button></div>
      {invitation && <div className="sync-secret"><strong>十分钟有效，仅能使用一次</strong><p>含同步密钥，请私下传给自己的设备，不要发到聊天、网盘公共链接或截图分享。</p><textarea readOnly value={invitation} aria-label="设备邀请" /><button onClick={() => setInvitation('')}>收起邀请</button></div>}
      {devices.length > 0 && <div className="sync-device-list"><h3>已配对设备</h3>{devices.map(device => <div className="sync-device" key={device.id}><MonitorSmartphone size={16} /><span>{device.name}{device.id === state.config.device ? ' · 此设备' : ''}{device.revoked ? ' · 已撤销' : ''}</span>{device.id !== state.config.device && !device.revoked && <button className="sync-danger" disabled={working} onClick={() => {
        if (!window.confirm('撤销后此设备无法再同步；它已获得的资料和密钥不会远程消失。确定撤销？')) return
        void action(async () => { await transport(state.config.url, '/v1/revoke', state.config.token, { id: device.id }); await loadDevices() })
      }}>撤销</button>}</div>)}</div>}
      {conflictKeys.map(key => <details className="sync-conflict" key={key}><summary>有不同修改 · {key.split('/')[0]}</summary><p>没有覆盖任何分支。查看后选择要继续使用的一版；其他版本仍保留在同步历史。想法手稿可先复制内容另存为新手稿。</p>{heads(state, key).map(version => <div key={version.id}><small>{new Date(version.at).toLocaleString('zh-CN')} · {version.device.slice(0, 8)}</small><pre>{version.value ? String(version.value.title ?? version.value.name ?? version.value.date ?? '') + '\n' + JSON.stringify(version.value, null, 2) : '此版本删除了记录'}</pre><button disabled={working} onClick={() => void action(() => resolveConflict(key, version.id))}>使用这一版</button></div>)}</details>)}
      <ConfigHandoffPanel client={desktopConfigHandoff(state.config)}/>
      {configError && <p className="sync-note" role="status">{configError}</p>}
      <details className="sync-management sync-advanced"><summary>高级连接选项</summary><p>已有连接保持不变。迁到云端请先完整备份并搬迁原服务，不要用空库替换。</p><HubMigrationSettings current={state.config.url} disabled={working || busy}/>
      <details><summary>恢复与连接管理</summary><p>断开只删除此机连接信息，不删除本机资料或中枢历史。请先在安全的离线位置保存管理设备恢复包；它含同步密钥和管理权限，不是给其他设备的一次性邀请。</p>{state.config.recovery && <button onClick={() => setRecovery(recoveryBundle(state))}>显示恢复包</button>}{recovery && <div className="sync-secret"><textarea readOnly value={recovery} aria-label="中枢恢复包"/><button onClick={() => setRecovery('')}>收起恢复包</button></div>}<button className="sync-danger" disabled={working} onClick={() => { if (window.confirm('确认已有恢复途径，并断开此机？待发送修改不会再上传。')) void action(disconnectDevice) }}>断开此机</button></details></details>
    </> : <DeviceSyncConnectionForm working={working} onConnect={connectDevice}/>}
    {(message || error) && <p role="status" className="sync-error">{message || error}</p>}
    <div className="sync-boundary"><ShieldCheck size={16} /><div><p>正文端到端加密，权限各自保留。同步不代替备份。</p><details><summary>同步范围与隐私边界</summary><p>中枢保存端到端加密的记录及设备/传输元信息。首版不传附件文件、加密作品、音乐及本机设置；正文中的图片引用可能在另一端缺图。资料在已配对设备上可读，连接信息受本机账户保护而非额外保险箱。兼容 API 配置需已有设备另行批准交接。</p></details></div></div>
  </section>
}
