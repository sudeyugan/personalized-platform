import { Heart, RefreshCw } from 'lucide-react'
import { useHeartRateStore, visibleHeartRate } from './heartRate'
import { HeartRateReadout } from './HeartRateReadout'
import './heartRate.css'

export function HeartRateSettings() {
  const { enabled, status, preferences, preferencesSaved, retryAt, enable, scan, reconnect, connect, disconnect, setAutoConnect, forgetDevice } = useHeartRateStore()
  const busy = status.phase === 'scanning' || status.phase === 'connecting'
  const bpm = visibleHeartRate({ enabled, ...status })
  return <section className="settings-section heart-rate-settings">
    <div className="settings-title"><Heart /><div><h2>实时心率</h2><p>佳明 265 / 标准 BLE 心率设备，仅在本机显示。</p></div></div>
    <div className="setting-row"><div><strong>连接心率设备</strong><span>首次选择手表，之后启用会找回它；心率不保存、不发送给 AI。</span></div>
      <button aria-label="启用实时心率" aria-pressed={enabled} className={enabled ? 'switch on' : 'switch'} onClick={() => void (enabled ? disconnect() : enable())}><i /></button>
    </div>
    {preferences.device && <div className="heart-rate-memory">
      <div className="heart-rate-remembered"><span><small>已记住的手表</small><strong>{preferences.device.name}</strong></span><button onClick={() => void forgetDevice()}>忘记设备</button></div>
      <div className="setting-row"><div><strong>启动时自动连接</strong><span>只寻找这块手表；每轮最多尝试三次，停止连接后本次不再自动启动。</span></div>
        <button aria-label="启动时自动连接心率设备" aria-pressed={preferences.autoConnect} className={preferences.autoConnect ? 'switch on' : 'switch'} onClick={() => setAutoConnect(!preferences.autoConnect)}><i /></button>
      </div>
      <p>识别信息仅保留在这台电脑，不进资料备份；不会保存心率历史。</p>
    </div>}
    {!preferencesSaved && <p className="heart-rate-save-warning" role="status">{preferences.device ? '本机未能保存设备偏好，当前可用，重开后可能需要重新选择。' : '未能移除本机的旧设备偏好。当前连接已停止，但重开后旧设置可能恢复。'}{!preferences.device && <button onClick={() => void forgetDevice()}>再试一次</button>}</p>}
    {enabled && <div className="heart-rate-controls">
      <div className="heart-rate-reading"><HeartRateReadout bpm={bpm} /><div className="heart-rate-reading-copy"><span className="heart-rate-eyebrow">此刻的心跳</span><div className="heart-rate-source"><span className={`heart-rate-dot${bpm ? ' live' : ''}`} aria-hidden="true" /><small>{status.deviceName ?? preferences.device?.name ?? '等待设备'}<span>{bpm ? '实时读数 · 仅本机' : '等待新的心率读数'}</span></small></div><p>一份安静的实时读数，不替你判断心情。</p></div></div>
      <p role="status">{status.message}</p>
      {retryAt !== null && <p className="heart-rate-retry">稍后会再寻找已记住的手表。可随时停止，不会一直扫描。</p>}
      <div className="heart-rate-buttons">
        {preferences.device && <button disabled={busy || status.phase === 'connected'} onClick={() => void reconnect()}>重新连接手表</button>}
        <button disabled={busy || status.phase === 'connected'} onClick={() => void scan()}><RefreshCw size={13} />重新扫描</button>
        <button onClick={() => void disconnect()}>停止连接</button>
      </div>
      {status.phase === 'idle' && status.devices.length > 0 && <div className="heart-rate-devices">{status.devices.map((device) => <button key={device.id} onClick={() => void connect(device.id)}><span>{device.name}</span><small>{device.id === preferences.device?.id ? '已记住 · 连接' : '连接并记住'}</small></button>)}</div>}
      <details><summary>手表如何开启广播？</summary><p>长按 UP → 健康与保健 → 腕式心率 → 广播心率 → START。中文菜单可能随固件略有不同；也可在控制菜单添加“广播心率”。保持广播开启和电脑蓝牙可用，然后选择扫描到的手表。</p><p>广播会增加耗电，结束后可在手表按 STOP。BLE 心率广播不是加密的私密连接，仅在需要时开启。读数仅供个人查看，不作健康诊断或情绪判断。</p></details>
    </div>}
  </section>
}
