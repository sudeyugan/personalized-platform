import { useEffect, useRef, useState } from 'react'
import { DEFAULT_PIXEL_ENHANCEMENTS } from '../../../../domain/pixelPetEnhancements'
import { PixelPetV2Renderer } from './PixelPetV2Renderer'
import type { RigPose } from './animation/types'
import type { FaceAttention } from './perception/types'
import type { PixelPetPose } from '../types'
import '../pixelPet.css'
import './PixelPetV2DebugPage.css'

const poses: [RigPose, string][] = [['neutral','基础'],['wave','招手'],['touch-hair','理头发'],['chin','托腮'],['stretch','伸懒腰'],['sleep','休息']]
const config = { ...DEFAULT_PIXEL_ENHANCEMENTS, enabled: true, autonomy: false }

export function PixelPetV2DebugPage() {
  const query = new URLSearchParams(location.search)
  const [pose, setPose] = useState<RigPose>(() => poses.some(([name])=>name===query.get('action')) ? query.get('action') as RigPose : 'neutral')
  const [placement, setPlacement] = useState<PixelPetPose>(() => query.get('pose')==='float'?'float':query.get('side')==='left-edge'?'left-edge':query.get('side')==='bottom-edge'?'bottom-edge':'right-edge')
  const [x,setX] = useState(()=>{const value=Number(query.get('look')??0);return Number.isFinite(value)?Math.max(-.6,Math.min(.6,value)):0}), [scale,setScale] = useState(2)
  const camera = useRef<FaceAttention|null>(null)
  useEffect(()=>{
    const update=()=>{camera.current={present:true,x,y:0,yaw:0,pitch:0,distance:1,at:performance.now()}}
    update();const timer=setInterval(update,100);return()=>{clearInterval(timer);camera.current=null}
  },[x])
  return <main className="pixel-pet-debug-page pixel-v2-debug">
    <section><h1>像素2.0 · 比例与跟随检查</h1><p>左边是未改动的基础原画，右边是实时动作。此页只模拟目标位置，不开启摄像头、不保存记录。</p>
      <label className="shortcut-picker"><span>动作</span><select aria-label="检查动作" value={pose} onChange={event=>setPose(event.target.value as RigPose)}>{poses.map(([name,label])=><option key={name} value={name}>{label}</option>)}</select></label>
      <label className="shortcut-picker"><span>摆放</span><select aria-label="检查摆放" value={placement} onChange={event=>setPlacement(event.target.value as PixelPetPose)}><option value="right-edge">右侧</option><option value="left-edge">左侧</option><option value="bottom-edge">底部</option><option value="float">自然半身</option></select></label>
      <label className="shortcut-picker"><span>模拟左右位置</span><input aria-label="模拟左右位置" type="range" min={-.6} max={.6} step={.01} value={x} onChange={event=>setX(Number(event.target.value))}/></label>
      <div className="pet-preview-controls"><button onClick={()=>setX(0)}>居中</button><button onClick={()=>setScale(scale===2?1:2)}>实际大小 / 放大</button></div>
    </section>
    <div className="pet-comparison">
      <figure><PixelPetV2Renderer enhancements={config} pose={placement} scale={scale} neutralPreview/><figcaption>基础原画 · 不变形</figcaption></figure>
      <figure><PixelPetV2Renderer enhancements={config} pose={placement} scale={scale} camera={camera} previewPose={pose}/><figcaption>同一尺度 · 实时{poses.find(([name])=>name===pose)?.[1]}</figcaption></figure>
    </div>
  </main>
}
