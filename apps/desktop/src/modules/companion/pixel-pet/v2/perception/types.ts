// Only scalar geometry may cross the desktop boundary. No image/landmark mesh,
// identity, device identifier, face history, window title or page text.
export interface FaceGeometry { present:boolean; x:number; y:number; size:number; yaw:number; pitch:number; at:number }
export interface FaceAttention { present:boolean; x:number; y:number; distance:number; yaw:number; pitch:number; at:number }
export interface WindowGeometryEvent {
  available:boolean; changed:boolean; left:number; top:number; right:number; bottom:number
  workLeft:number; workTop:number; workRight:number; workBottom:number
}
