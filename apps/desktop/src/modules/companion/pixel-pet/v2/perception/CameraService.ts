import { createFaceTracker } from './FaceTracker'
import type { CameraPreferences } from './CameraPreferences'
import { createGazeController } from './GazeController'
import { updateCameraStatus,type CameraPhase } from './CameraStatus'
import type { FaceAttention } from './types'
export function startCamera(preferences:CameraPreferences,onAttention:(attention:FaceAttention|null)=>void) {
  if(!preferences.enabled)return {stop:()=>{}} // never infer consent from renderer activity
  let stopped=false,stream:MediaStream|undefined,tracker:ReturnType<typeof createFaceTracker>|undefined,timer:ReturnType<typeof setTimeout>|undefined
  const video=document.createElement('video'),canvas=document.createElement('canvas'),gaze=createGazeController()
  video.muted=true;video.playsInline=true;canvas.width=320;canvas.height=240
  const ended=()=>fail('unavailable')
  const stop=(phase:CameraPhase='off')=>{
    if(stopped)return;stopped=true;clearTimeout(timer);tracker?.stop()
    stream?.getTracks().forEach(track=>{track.removeEventListener('ended',ended);track.stop()})
    video.pause();video.srcObject=null;canvas.width=canvas.height=0;gaze.reset();onAttention(null);updateCameraStatus(phase)
  }
  const fail=(phase:CameraPhase)=>stop(phase)
  const tick=async()=>{
    if(stopped)return
    if(video.readyState>=2&&tracker&&!tracker.busy){
      try{
        canvas.getContext('2d')!.drawImage(video,0,0,320,240)
        const bitmap=await createImageBitmap(canvas)
        if(stopped){bitmap.close();return}
        tracker.submit(bitmap,performance.now())
      }catch{fail('unavailable');return}
    }
    if(!stopped)timer=setTimeout(()=>{void tick()},125)
  }
  const initialize=async()=>{
    updateCameraStatus('starting')
    try{
      tracker=createFaceTracker(raw=>{
        if(stopped)return
        const attention=gaze.update(raw,preferences,performance.now())
        onAttention({...attention,at:Date.now()});updateCameraStatus('active',raw)
      },()=>fail('model-error'))
      await tracker.ready
      if(stopped)return
      if(!navigator.mediaDevices?.getUserMedia){fail('unavailable');return}
      const acquired=await navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:320},height:{ideal:240},frameRate:{ideal:8,max:10},...(preferences.deviceId?{deviceId:{exact:preferences.deviceId}}:{})}})
      if(stopped){acquired.getTracks().forEach(track=>track.stop());return}
      stream=acquired;stream.getVideoTracks().forEach(track=>track.addEventListener('ended',ended))
      video.srcObject=stream;await video.play()
      if(!stopped)void tick()
    }catch(error){if(!stopped)fail(error instanceof DOMException&&error.name==='NotAllowedError'?'denied':'unavailable')}
  }
  void initialize()
  return {stop}
}
