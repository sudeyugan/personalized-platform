import loader from '@mediapipe/tasks-vision/vision_wasm_module_internal.js?url'
import wasm from '@mediapipe/tasks-vision/vision_wasm_module_internal.wasm?url'
import type { FaceGeometry } from './types'
import { validFaceGeometry } from './GazeController'
const model=new URL('./assets/face_landmarker.task',import.meta.url).href
export function createFaceTracker(onGeometry:(geometry:FaceGeometry)=>void,onFailure:()=>void) {
  const worker=new Worker(new URL('./face.worker.ts',import.meta.url),{type:'module'})
  let stopped=false,busy=false,deadline:ReturnType<typeof setTimeout>|undefined
  let rejectReady:(error:Error)=>void=()=>{}
  const ready=new Promise<void>((resolve,reject)=>{
    rejectReady=reject
    deadline=setTimeout(()=>{reject(new Error('MODEL_TIMEOUT'));onFailure()},15000)
    worker.onmessage=({data})=>{
      if(stopped)return
      if(data?.type==='ready'){clearTimeout(deadline);deadline=undefined;resolve()}
      else if(data?.type==='geometry'&&validFaceGeometry(data.geometry)){clearTimeout(deadline);deadline=undefined;busy=false;onGeometry(data.geometry)}
      else {reject(new Error('MODEL_UNAVAILABLE'));onFailure()}
    }
    worker.onerror=()=>{reject(new Error('MODEL_UNAVAILABLE'));if(!stopped)onFailure()}
    worker.postMessage({type:'init',assets:{model:new URL(model,location.href).href,loader:new URL(loader,location.href).href,wasm:new URL(wasm,location.href).href}})
  })
  return {
    ready,
    get busy(){return busy},
    submit(bitmap:ImageBitmap,at:number){
      if(stopped||busy){bitmap.close();return}
      busy=true;deadline=setTimeout(()=>{if(!stopped)onFailure()},2500)
      try{worker.postMessage({type:'frame',bitmap,at},[bitmap])}catch{bitmap.close();if(!stopped)onFailure()}
    },
    stop(){if(stopped)return;stopped=true;clearTimeout(deadline);rejectReady(new Error('CAMERA_STOPPED'));worker.onmessage=null;worker.onerror=null;worker.terminate()},
  }
}
