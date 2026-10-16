import { useCallback,useEffect,useRef,useState } from 'react'
import { createCameraCalibration } from './CameraCalibration'
import { readCameraStatus,subscribeCameraStatus } from './CameraStatus'
import { readCameraPreferences } from './CameraPreferences'
import type { CameraPreferences,CameraCalibration } from './CameraPreferences'
type Session=ReturnType<typeof createCameraCalibration>
export function useCameraCalibration(preferences:CameraPreferences,onSave:(calibration:CameraCalibration)=>boolean){
  const [state,setState]=useState<ReturnType<Session['snapshot']>|null>(null),[notice,setNotice]=useState('')
  const active=useRef<Session|null>(null),save=useRef(onSave);save.current=onSave
  const sessionIdentity=useRef('')
  const identity=JSON.stringify([preferences.enabled,preferences.deviceId,preferences.mirror])
  const finish=useCallback((session:Session,centerOnly=false)=>{
    if(active.current!==session)return
    const snapshot=session.snapshot()
    active.current=null;setState(null)
    const live=readCameraPreferences()
    if(JSON.stringify([live.enabled,live.deviceId,live.mirror])!==sessionIdentity.current){setNotice('摄像头设置已变化，本次校准未保存。');return}
    if(snapshot.center&&(centerOnly||snapshot.stage==='done')){
      const calibration=centerOnly&&live.calibration?.rangeX?{...snapshot.center,rangeX:live.calibration.rangeX}:snapshot.center
      setNotice(save.current(calibration)?centerOnly?'居中校准已保存，未改变跟随范围。':'对视校准已保存；仅本机基准和范围参数，不保存采样轨迹。':'校准未能保存，请重试或检查本机存储。')
    }
    else setNotice(snapshot.error||'本次未保存，原校准保持不变。')
  },[])
  useEffect(()=>{
    active.current?.cancel();active.current=null;setState(null);setNotice('')
    const tick=()=>{
      const session=active.current;if(!session)return
      const live=readCameraPreferences()
      if(JSON.stringify([live.enabled,live.deviceId,live.mirror])!==identity){session.cancel();finish(session);return}
      const status=readCameraStatus()
      if(status.phase!=='active'){session.cancel();finish(session);return}
      const value=session.sample(status.geometry,performance.now())
      if(value.stage==='done'||value.stage==='failed')finish(session)
      else setState(value)
    }
    const off=subscribeCameraStatus(tick),timer=setInterval(tick,200)
    return()=>{off();clearInterval(timer);active.current?.cancel();active.current=null}
  },[identity,finish])
  return {state,notice,start(){
    if(readCameraStatus().phase!=='active'||!preferences.enabled){setNotice('请先开启本地追踪，并保持脸部可见。');return}
    const live=readCameraPreferences()
    if(JSON.stringify([live.enabled,live.deviceId,live.mirror])!==identity){setNotice('摄像头设置已变化，请重试。');return}
    const session=createCameraCalibration(preferences.deviceId,preferences.mirror,performance.now());sessionIdentity.current=identity;active.current=session;setNotice('');setState(session.snapshot())
  },cancel(){const session=active.current;if(session){session.cancel();finish(session)}},saveCenter(){const session=active.current;if(session)finish(session,true)}}
}
