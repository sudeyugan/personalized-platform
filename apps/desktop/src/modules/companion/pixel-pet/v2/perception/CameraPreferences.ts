export interface CameraCalibration {x:number;y:number;size:number;deviceId:string;rangeX?:number}
export interface CameraPreferences {
  enabled:boolean;deviceId:string;mirror:boolean;mount:'top'
  calibration:CameraCalibration|null
}
export const CAMERA_KEY='yiyu.pixel-pet.camera.v1',CAMERA_CHANGED='yiyu:pixel-pet-camera'
const base:CameraPreferences={enabled:false,deviceId:'',mirror:true,mount:'top',calibration:null}
const unit=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1
export function normalizeCameraPreferences(value:unknown):CameraPreferences {
  if(!value||typeof value!=='object')return {...base}
  const raw=value as Partial<CameraPreferences>,c=raw.calibration
  const deviceId=typeof raw.deviceId==='string'&&raw.deviceId.length<=256?raw.deviceId:''
  return {enabled:raw.enabled===true,deviceId,mirror:raw.mirror!==false,mount:'top',calibration:c&&unit(c.x)&&unit(c.y)&&unit(c.size)&&c.size>.02&&c.deviceId===deviceId?{x:c.x,y:c.y,size:c.size,deviceId,...(typeof c.rangeX==='number'&&Number.isFinite(c.rangeX)&&c.rangeX>=.06&&c.rangeX<=.35?{rangeX:c.rangeX}:{})}:null}
}
export function readCameraPreferences():CameraPreferences {
  try{return normalizeCameraPreferences(JSON.parse(localStorage.getItem(CAMERA_KEY)??'null'))}catch{return {...base}}
}
export function writeCameraPreferences(changes:Partial<CameraPreferences>) {
  const next=normalizeCameraPreferences({...readCameraPreferences(),...changes})
  // Camera consent/device/calibration stay on this computer, never LibraryData or backups.
  localStorage.setItem(CAMERA_KEY,JSON.stringify(next));window.dispatchEvent(new Event(CAMERA_CHANGED))
  return next
}
export function subscribeCameraPreferences(listener:()=>void) {
  const storage=(event:StorageEvent)=>{if(event.key===CAMERA_KEY)listener()}
  window.addEventListener(CAMERA_CHANGED,listener);window.addEventListener('storage',storage)
  return ()=>{window.removeEventListener(CAMERA_CHANGED,listener);window.removeEventListener('storage',storage)}
}
