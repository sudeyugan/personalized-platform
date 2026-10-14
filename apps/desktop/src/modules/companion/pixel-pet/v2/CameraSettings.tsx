import { useEffect,useState,useSyncExternalStore } from 'react'
import { readCameraPreferences,writeCameraPreferences,subscribeCameraPreferences } from './perception/CameraPreferences'
import { readCameraStatus,subscribeCameraStatus } from './perception/CameraStatus'
import license from './perception/assets/LICENSE.mediapipe.txt?raw'
const labels={off:'未开启',waiting:'等待可见的像素2.0桌宠',starting:'正在准备本地模型',active:'本地感知中',denied:'摄像头权限被拒绝，请检查Windows授权',unavailable:'摄像头不可用，请检查设备后重试','model-error':'本地视觉模型未能启动，桌宠动画不受影响'}
export function CameraSettings() {
  const [preferences,setPreferences]=useState(readCameraPreferences),[devices,setDevices]=useState<MediaDeviceInfo[]>([]),[error,setError]=useState('')
  const status=useSyncExternalStore(subscribeCameraStatus,readCameraStatus)
  useEffect(()=>subscribeCameraPreferences(()=>setPreferences(readCameraPreferences())),[])
  const change=(changes:Parameters<typeof writeCameraPreferences>[0])=>{
    try{setPreferences(writeCameraPreferences(changes));setError('')}catch{setError('本机偏好未保存，请检查存储权限；没有自动开启摄像头。')}
  }
  const refresh=async()=>{
    try{setDevices((await navigator.mediaDevices.enumerateDevices()).filter(device=>device.kind==='videoinput'));setError('')}catch{setError('当前环境无法列出摄像头；Windows桌面版中可重试。')}
  }
  useEffect(()=>{if(status.phase==='active')void refresh()},[status.phase])
  return <section className="pet-v2-camera">
    <label className="pet-v2-toggle"><span><strong>开启本地追踪</strong><small>首次需要你的摄像头授权；切换版本不会替你授权</small></span><input type="checkbox" aria-label="开启桌宠本地摄像头感知" checked={preferences.enabled} onChange={event=>change({enabled:event.target.checked})}/></label>
    <small role="status">{labels[status.phase]}{status.phase==='active'?(status.geometry?.present?' · 单人目标可见':' · 未确认单人目标'):''}</small>
    <details onToggle={event=>{if(event.currentTarget.open)void refresh()}}><summary>摄像头与校准</summary>
      <label><span>设备</span><select aria-label="桌宠摄像头设备" value={preferences.deviceId} onChange={event=>change({deviceId:event.target.value,calibration:null})}><option value="">系统默认摄像头</option>{devices.map((device,index)=><option key={device.deviceId} value={device.deviceId}>{device.label||`摄像头 ${index+1}`}</option>)}</select></label>
      <small>摄像头位置：屏幕上方中央</small>
      <label className="pet-v2-check"><input type="checkbox" aria-label="镜像摄像头方向" checked={preferences.mirror} onChange={event=>change({mirror:event.target.checked})}/>镜像方向</label>
      <div className="pet-v2-actions"><button className="ghost-button" disabled={!status.geometry?.present} onClick={()=>{const raw=status.geometry;if(raw?.present)change({calibration:{x:raw.x,y:raw.y,size:raw.size,deviceId:preferences.deviceId}})}}>居中校准</button><button className="ghost-button" onClick={()=>change({calibration:null})}>重置校准</button><button className="ghost-button" onClick={()=>change({enabled:preferences.enabled})}>重试感知</button></div>
      <small>正坐并看向屏幕后校准。只估计相对远近与头部朝向，不识别身份，也不是精确眼球视线。隐藏桌宠、切回原版或其他造型/WebM时停止采集。</small>
      <details className="pet-v2-license"><summary>本地模型与许可证</summary><small>MediaPipe Authors / Google · Apache 2.0。固定本地模型、CPU Worker推理，不下载远程脚本。设备选择与校准仅保存在本机，不进入资料备份。</small><pre>{license}</pre></details>
    </details>
    {error&&<small role="alert">{error}</small>}
  </section>
}
