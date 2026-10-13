import { FaceLandmarker } from '@mediapipe/tasks-vision'
import { faceGeometry } from './FaceGeometry'
interface Assets {model:string;loader:string;wasm:string}
type Input={type:'init';assets:Assets}|{type:'frame';bitmap:ImageBitmap;at:number}
const scope=self as unknown as {onmessage:((event:MessageEvent<Input>)=>void)|null;postMessage:(data:unknown)=>void}
const MODEL_SHA='64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff'
let detector:FaceLandmarker|undefined
const local=(raw:string)=>{
  const url=new URL(raw,location.href)
  if(url.origin!==location.origin||url.username||url.password)throw new Error('local assets only')
  return url.href
}
scope.onmessage=async({data})=>{
  if(data.type==='init'){
    try{
      if(detector)throw new Error('already initialized')
      const response=await fetch(local(data.assets.model),{credentials:'omit',redirect:'error'})
      if(!response.ok)throw new Error('model unavailable')
      const buffer=await response.arrayBuffer()
      if(buffer.byteLength!==3758596)throw new Error('model size')
      const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(byte=>byte.toString(16).padStart(2,'0')).join('')
      if(digest!==MODEL_SHA)throw new Error('model integrity')
      detector=await FaceLandmarker.createFromOptions({wasmLoaderPath:local(data.assets.loader),wasmBinaryPath:local(data.assets.wasm)},
        {baseOptions:{modelAssetBuffer:new Uint8Array(buffer),delegate:'CPU'},runningMode:'VIDEO',numFaces:2,minFaceDetectionConfidence:.6,minFacePresenceConfidence:.6,minTrackingConfidence:.6,outputFaceBlendshapes:false,outputFacialTransformationMatrixes:true})
      scope.postMessage({type:'ready'})
    }catch{detector?.close();detector=undefined;scope.postMessage({type:'error',code:'model'})}
  }else if(data.type==='frame'){
    try{
      if(!detector)throw new Error('not ready')
      const result=detector.detectForVideo(data.bitmap,data.at)
      const geometry=faceGeometry(result.faceLandmarks,result.facialTransformationMatrixes[0]?.data,data.at)
      scope.postMessage({type:'geometry',geometry}) // never mesh, bitmap or face identity
    }catch{scope.postMessage({type:'error',code:'inference'})}
    finally{data.bitmap.close()}
  }
}
