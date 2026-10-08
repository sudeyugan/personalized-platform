import { useCallback, useEffect, useRef, useState } from 'react'
import { openPcmCapture } from '../../infrastructure/localVoice'
import { microphoneLevel, readMicrophonePreferences, saveMicrophonePreferences } from '../../infrastructure/microphonePreferences'

export function MicrophoneSettings({ wakeEnabled }: { wakeEnabled: boolean }) {
  const [preferences, setPreferences] = useState(readMicrophonePreferences)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [testing, setTesting] = useState(false)
  const [level, setLevel] = useState(0)
  const [note, setNote] = useState('检测仅在本机显示音量，不保存录音、不连接识别服务。')
  const capture = useRef<{ stop: () => void } | undefined>(undefined)
  const generation = useRef(0)
  const timer = useRef<number | undefined>(undefined)
  const stop = useCallback(() => { generation.current++; capture.current?.stop(); capture.current = undefined; window.clearTimeout(timer.current); setTesting(false); setLevel(0) }, [])
  useEffect(() => { if (wakeEnabled) stop() }, [wakeEnabled, stop])
  useEffect(() => () => { generation.current++; capture.current?.stop(); window.clearTimeout(timer.current) }, [])
  const update = (next: typeof preferences) => {
    stop()
    try { saveMicrophonePreferences(next); setPreferences(next) } catch { setNote('无法保存本机麦克风设置，请检查存储权限。') }
  }
  const test = async () => {
    if (testing) { stop(); return }
    const lease = ++generation.current
    setTesting(true)
    try {
      const input = await openPcmCapture((samples) => { if (lease === generation.current) setLevel(microphoneLevel(samples)) })
      if (lease !== generation.current) { input.stop(); return }
      capture.current = input
      const inputs = await navigator.mediaDevices.enumerateDevices()
      if (lease !== generation.current) return
      setDevices(inputs.filter((device) => device.kind === 'audioinput'))
      setNote('按平常距离说一句话；音量很低时先检查输入设备，再尝试小幅增加增益。')
      timer.current = window.setTimeout(stop, 15_000)
    } catch (error) { if (lease === generation.current) { stop(); setNote(error instanceof Error ? error.message : '麦克风不可用') } }
  }
  return <section className="microphone-settings">
    <label className="setting-row"><div><strong>收音设备</strong><span>本机设置；请先关闭语音唤醒再调整，避免同时采集</span></div><select aria-label="收音设备" value={preferences.deviceId} disabled={wakeEnabled || testing} onChange={(event) => update({ ...preferences, deviceId: event.target.value })}><option value="">系统默认麦克风</option>{preferences.deviceId && !devices.some((device) => device.deviceId === preferences.deviceId) && <option value={preferences.deviceId}>已选麦克风（检测后刷新）</option>}{devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || '麦克风 ' + (index + 1)}</option>)}</select></label>
    <label className="setting-row"><div><strong>唤醒收音增益 · {preferences.gain.toFixed(1)}×</strong><span>用于本地唤醒和唤醒后的交谈；过高会放大噪声，不改变系统音量</span></div><input aria-label="本地收音增益" type="range" min="1" max="3" step="0.1" value={preferences.gain} disabled={wakeEnabled || testing} onChange={(event) => update({ ...preferences, gain: Number(event.target.value) })} /></label>
    <div className="local-voice-actions"><button disabled={wakeEnabled} onClick={() => void test()}>{testing ? '结束收音检测' : '检测麦克风'}</button><meter aria-label="本地麦克风音量" min="0" max="1" value={level} /></div><p className="voice-provider-note">{note}</p>
  </section>
}
