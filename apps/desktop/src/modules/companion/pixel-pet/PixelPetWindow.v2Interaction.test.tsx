import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { emptyCompanionDesktopSnapshot } from '../companionDesktop'
import { DEFAULT_PIXEL_ENHANCEMENTS } from '../../../domain/pixelPetEnhancements'
import { PixelPetWindow } from './PixelPetWindow'
import type { PixelPetV2Props } from './v2/PixelPetV2Renderer'
import { createBehaviorController, type BehaviorInput } from './v2/behavior/BehaviorController'
import { createMotionController } from './v2/animation/MotionController'

const fixture=vi.hoisted(()=>({props:{} as Partial<PixelPetV2Props>,emit:vi.fn().mockResolvedValue(undefined)}))
vi.mock('@tauri-apps/api/event',()=>({emitTo:fixture.emit}))
vi.mock('@tauri-apps/api/window',()=>({getCurrentWindow:()=>({setIgnoreCursorEvents:async()=>{},setAlwaysOnTop:async()=>{},startDragging:async()=>{}})}))
vi.mock('./usePixelPetPointer',()=>({usePixelPetPointer:()=>({pointer:{current:null},error:''})}))
vi.mock('./v2/perception/usePetPerception',()=>({usePetPerception:()=>({camera:{current:null}})}))
vi.mock('./PixelPetAppearance',()=>({PixelPetAppearance:(props:Partial<PixelPetV2Props>)=>{
  fixture.props=props
  if(props.headGeometry)props.headGeometry.current={x:96,y:70,rx:25,ry:30}
  return null
}}))

beforeEach(()=>{
  vi.clearAllMocks();fixture.props={}
  vi.stubGlobal('PointerEvent',class extends MouseEvent{
    pointerId:number
    constructor(type:string,init:PointerEventInit={}){super(type,init);this.pointerId=init.pointerId??1}
  })
})
afterEach(()=>vi.unstubAllGlobals())
function open(){
  render(<PixelPetWindow snapshot={{...emptyCompanionDesktopSnapshot,pixelPetEnabled:true,pixelPetStyle:'pixel',desktopVisible:true,pixelEnhancements:{...DEFAULT_PIXEL_ENHANCEMENTS,enabled:true}}} layout={{scale:1,pixelRatio:1,ready:true,pose:'float'}}/>)
  const button=screen.getByRole('button',{name:/拖动移动/})
  Object.assign(button,{setPointerCapture:vi.fn(),hasPointerCapture:()=>true,releasePointerCapture:vi.fn(),getBoundingClientRect:()=>({left:0,top:0,width:192,height:240})})
  return button
}
function sample(now:number):BehaviorInput{
  const props=fixture.props
  return {now,settings:{...DEFAULT_PIXEL_ENHANCEMENTS,enabled:true},pointer:null,camera:null,conversation:'idle',dragging:false,engaged:Boolean(props.engaged),pat:props.headPat?.current??0,response:props.response?.current??0,reduced:false}
}
function tap(button:HTMLElement,y:number){
  fireEvent.pointerDown(button,{button:0,pointerId:1,clientX:96,clientY:y})
  fireEvent.pointerUp(button,{button:0,pointerId:1,clientX:96,clientY:y})
}
it('opens chat on a real body click without a wave frame before chat state arrives',()=>{
  const button=open(),behavior=createBehaviorController(()=>0),motion=createMotionController(()=>.5)
  motion.update(0,behavior.update(sample(0)))
  tap(button,200)
  expect(fixture.emit).toHaveBeenCalledExactlyOnceWith('main','companion:chat-toggle')
  expect(fixture.props.response!.current).toBe(1)
  for(let now=33;now<1000;now+=33)expect(motion.update(now,behavior.update(sample(now))).poses).toEqual([{pose:'neutral',weight:1}])
})
it('still consumes a head tap as shy feedback without opening chat',()=>{
  const button=open(),behavior=createBehaviorController(()=>0)
  behavior.update(sample(0));tap(button,70)
  expect(fixture.emit).not.toHaveBeenCalled()
  expect(behavior.update(sample(33))).toMatchObject({pose:'neutral',expression:'shy',pat:true})
})
it('does not turn opening or dismissing the context menu into a delayed wave',()=>{
  const button=open(),behavior=createBehaviorController(()=>0)
  behavior.update(sample(0));fireEvent.contextMenu(button,{clientX:100,clientY:200})
  expect(screen.getByRole('menu')).toBeInTheDocument()
  expect(behavior.update(sample(33)).pose).toBe('neutral')
  fireEvent.pointerDown(button,{button:0,pointerId:1,clientX:100,clientY:200})
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  expect(behavior.update(sample(66)).pose).toBe('neutral')
  expect(fixture.emit).not.toHaveBeenCalled()
})
