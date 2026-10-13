import type { FaceGeometry } from './types'
interface Point {x:number;y:number;z?:number}
// Called in Worker only; the478-point mesh never leaves the inference worker.
export function faceGeometry(faces:Point[][],matrix:number[]|undefined,at:number):FaceGeometry {
  const empty={present:false,x:.5,y:.5,size:0,yaw:0,pitch:0,at}
  if(faces.length!==1||faces[0].length<455)return empty
  const face=faces[0],points=face.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))
  if(points.length!==face.length)return empty
  const left=Math.min(...points.map(p=>p.x)),right=Math.max(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y)),bottom=Math.max(...points.map(p=>p.y))
  const size=Math.sqrt(Math.max(0,(right-left)*(bottom-top)))
  if(size<.06||size>1||left<-.1||right>1.1||top<-.1||bottom>1.1)return empty
  const yaw=matrix?.length===16?Math.atan2(matrix[8],matrix[0]):0
  const pitch=matrix?.length===16?Math.atan2(-matrix[9],Math.hypot(matrix[8],matrix[10])):0
  return {present:true,x:Math.max(0,Math.min(1,(left+right)/2)),y:Math.max(0,Math.min(1,(top+bottom)/2)),size,yaw,pitch,at}
}
