import type { FaceGeometry } from './types'
export type CameraPhase='off'|'waiting'|'starting'|'active'|'denied'|'unavailable'|'model-error'
interface CameraStatus {phase:CameraPhase;geometry:FaceGeometry|null}
let status:CameraStatus={phase:'off',geometry:null}
const listeners=new Set<()=>void>()
export const readCameraStatus=()=>status
export function updateCameraStatus(phase:CameraPhase,geometry:FaceGeometry|null=null){status={phase,geometry};listeners.forEach(listener=>listener())}
export function subscribeCameraStatus(listener:()=>void){listeners.add(listener);return ()=>{listeners.delete(listener)}}
