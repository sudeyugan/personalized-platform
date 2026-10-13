import type { WindowGeometryEvent } from '../perception/types'
const fields=['available','changed','left','top','right','bottom','workLeft','workTop','workRight','workBottom']
export function validWindowGeometry(value:unknown):value is WindowGeometryEvent {
  if(!value||typeof value!=='object'||Object.keys(value).some(key=>!fields.includes(key)))return false
  const w=value as WindowGeometryEvent
  if(typeof w.available!=='boolean'||typeof w.changed!=='boolean')return false
  if(!fields.slice(2).every(key=>Number.isInteger(w[key as keyof WindowGeometryEvent])&&Math.abs(w[key as keyof WindowGeometryEvent] as number)<=200000))return false
  return !w.available||(w.right>w.left&&w.bottom>w.top&&w.workRight>w.workLeft&&w.workBottom>w.workTop)
}
