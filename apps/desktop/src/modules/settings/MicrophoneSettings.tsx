import { useCallback, useEffect, useRef, useState } from 'react'
import { openPcmCapture } from '../../infrastructure/localVoice'
import { microphoneLevel, readMicrophonePreferences, saveMicrophonePreferences } from '../../infrastructure/microphonePreferences'
import { listen } from '@tauri-apps/api/event'

export function MicrophoneSettings({ wakeEnabled, busy=false }: { wakeEnabled: boolean; busy?:boolean }) {
  const [preferences, setPreferences] = useState(readMicrophonePreferences)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [testing, setTesting] = useState(false)
  const [level, setLevel] = useState(0)
  const [note, setNote] = useState('检测仅在本机显示音量，不保存录音、不连接识别服务。')
  const capture = useRef<{ stop: () => void } | undefined>(undefined)
  const generation = useRef(0)
  const timer = useRef<number | undefined>(undefined)
  const refreshDevices=useCallback(async()=>{
    try {const inputs=await navigator.mediaDevices?.enumerateDevices();if(inputs)setDevices(inputs.filter(device=>device.kind==='audioinput'))}catch{setNote('暂时无法枚举麦克风；仍可使用系统默认设备。')}
  },[])
  useEffect(()=>{void refreshDevices()},[refreshDevices])
  useEffect(()=>{
    if(!wakeEnabled||!('__TAURI_INTERNALS__' in window))return
    let disposed=false,off:(()=>void)|undefined,diagnosticOff:(()=>void)|undefined,expiry:number|undefined
    void listen<{level:number}>('companion:local-voice-level',({payload})=>{
      if(disposed||!Number.isFinite(payload.level))return
      setLevel(Math.max(0,Math.min(1,payload.level)));window.clearTimeout(expiry);expiry=window.setTimeout(()=>setLevel(0),4000)
    }).then(stop=>{if(disposed)stop();else off=stop}).catch(()=>undefined)
    void listen<{kind:string}>('companion:local-voice-diagnostic',({payload})=>{
      if(disposed)return
      if(payload.kind==='detected')setNote('唤醒词和声纹已通过，已进入交谈。')
      else if(payload.kind==='speaker_audio_short')setNote('唤醒词已识别，但有效声音太短；名字后接一句话再试。')
      else if(payload.kind==='speaker_mismatch')setNote('唤醒词已识别，但声纹未通过；按录入距离说话或重新录入。')
    }).then(stop=>{if(disposed)stop();else diagnosticOff=stop}).catch(()=>undefined)
    return()=>{disposed=true;off?.();diagnosticOff?.();window.clearTimeout(expiry);setLevel(0)}
  },[wakeEnabled])
  const stop = useCallback(() => { generation.current++; capture.current?.stop(); capture.current = undefined; window.clearTimeout(timer.current); setTesting(false); setLevel(0) }, [])
  useEffect(() => { if (wakeEnabled) stop() }, [wakeEnabled, stop])
  useEffect(() => () => { generation.current++; capture.current?.stop(); window.clearTimeout(timer.current) }, [])
  const update = (next: typeof preferences) => {
    stop()
    try { saveMicrophonePreferences(next); setPreferences(next) } catch { setNote('无法保存本机麦克风设置，请检查存储权限。') }
  }
  const test = async () => {
    if(wakeEnabled){await refreshDevices();setNote('正在显示唤醒监听的实际音量，没有另开麦克风。正常音量却不醒时可调高灵敏度；提示声纹未通过时请重新录入。');return}
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
    <label className="setting-row"><div><strong>收音设备</strong><span>本机设置；修改后自动重启本地监听，不必先关闭唤醒</span></div><select aria-label="收音设备" value={preferences.deviceId} disabled={testing||busy} onChange={(event) => update({ ...preferences, deviceId: event.target.value })}><option value="">系统默认麦克风</option>{preferences.deviceId && !devices.some((device) => device.deviceId === preferences.deviceId) && <option value={preferences.deviceId}>已选麦克风（检测后刷新）</option>}{devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || '麦克风 ' + (index + 1)}</option>)}</select></label>
    <label className="setting-row"><div><strong>唤醒收音增益 · {preferences.gain.toFixed(1)}×</strong><span>用于本地唤醒和交谈；修改后重启监听，过高会放大噪声，不改变系统音量</span></div><input aria-label="本地收音增益" type="range" min="1" max="3" step="0.1" value={preferences.gain} disabled={testing||busy} onChange={(event) => update({ ...preferences, gain: Number(event.target.value) })} /></label>
    <div className="local-voice-actions"><button disabled={busy} onClick={() => void test()}>{testing ? '结束收音检测' : wakeEnabled?'查看监听音量':'检测麦克风'}</button><meter aria-label="本地麦克风音量" min="0" max="1" value={level} /></div><p className="voice-provider-note">{note}</p>
  </section>
}
