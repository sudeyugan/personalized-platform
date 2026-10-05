import { Heart, RefreshCw } from 'lucide-react'
import { useHeartRateStore, visibleHeartRate } from './heartRate'
import './heartRate.css'

export function HeartRateSettings() {
  const { enabled, status, scan, connect, disconnect } = useHeartRateStore()
  const busy = status.phase === 'scanning' || status.phase === 'connecting'
  const bpm = visibleHeartRate({ enabled, ...status })
  return <section className="settings-section heart-rate-settings">
    <div className="settings-title"><Heart /><div><h2>实时心率</h2><p>佳明 265 / 标准 BLE 心率设备，仅在本机显示。</p></div></div>
    <div className="setting-row"><div><strong>连接心率设备</strong><span>本次运行启用；不保存读数，不发送给 AI，不自动重连。</span></div>
      <button aria-label="启用实时心率" aria-pressed={enabled} className={enabled ? 'switch on' : 'switch'} onClick={() => void (enabled ? disconnect() : scan())}><i /></button>
    </div>
    {enabled && <div className="heart-rate-controls">
      <div className="heart-rate-reading"><Heart size={21} /><strong>{bpm ?? '—'}</strong><span>bpm</span>{status.deviceName && <small>{status.deviceName}</small>}</div>
      <p role="status">{status.message}</p>
      <div className="heart-rate-buttons">
        <button disabled={busy || status.phase === 'connected'} onClick={() => void scan()}><RefreshCw size={13} />重新扫描</button>
        <button onClick={() => void disconnect()}>停止连接</button>
      </div>
      {status.phase === 'idle' && status.devices.length > 0 && <div className="heart-rate-devices">{status.devices.map((device) => <button key={device.id} onClick={() => void connect(device.id)}><span>{device.name}</span><small>连接</small></button>)}</div>}
      <details><summary>手表如何开启广播？</summary><p>长按 UP → 健康与保健 → 腕式心率 → 广播心率 → START。中文菜单可能随固件略有不同；也可在控制菜单添加“广播心率”。保持广播开启和电脑蓝牙可用，然后选择扫描到的手表。</p><p>广播会增加耗电，结束后可在手表按 STOP。BLE 心率广播不是加密的私密连接，仅在需要时开启。读数仅供个人查看，不作健康诊断或情绪判断。</p></details>
    </div>}
  </section>
}
