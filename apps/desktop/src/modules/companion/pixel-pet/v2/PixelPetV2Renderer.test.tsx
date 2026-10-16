import { act,fireEvent,render,screen } from '@testing-library/react'
import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import { DEFAULT_PIXEL_ENHANCEMENTS } from '../../../../domain/pixelPetEnhancements'
import { PixelPetV2Renderer } from './PixelPetV2Renderer'
import { cameraLook,restingLook } from './perception/CameraLook'
import type { RigFrame } from './animation/types'
import type { FaceAttention } from './perception/types'
import { personLook } from './perception/LookAttention'
const fake=vi.hoisted(()=>({load:vi.fn(),draw:vi.fn()}))
vi.mock('./rig/RigAssets',()=>({loadRigAssets:fake.load}))
vi.mock('./rig/RigRenderer',()=>({createRigRenderer:()=>({center:{x:96,y:72},draw:fake.draw})}))
vi.mock('../PixelPetRenderer',()=>({PixelPetRenderer:()=> <canvas data-testid="legacy-fallback"/>}))
let resolve:(value:Map<never,never>)=>void,reject:(value:Error)=>void
let sequence=0,requests:Map<number,FrameRequestCallback>
beforeEach(()=>{
  sequence=0;requests=new Map()
  fake.draw.mockReset();fake.draw.mockReturnValue({x:96,y:72,rx:35,ry:42})
  fake.load.mockImplementation(()=>new Promise((yes,no)=>{resolve=yes;reject=no}))
  vi.stubGlobal('requestAnimationFrame',vi.fn((callback:FrameRequestCallback)=>{requests.set(++sequence,callback);return sequence}))
  vi.stubGlobal('cancelAnimationFrame',vi.fn((id:number)=>requests.delete(id)))
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({setTransform:vi.fn()} as unknown as CanvasRenderingContext2D)
})
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})
it('never schedules a second animation loop when visibility changes during image decoding',async()=>{
  const hit={current:null},view=render(<PixelPetV2Renderer enhancements={DEFAULT_PIXEL_ENHANCEMENTS} headGeometry={hit}/>)
  act(()=>document.dispatchEvent(new Event('visibilitychange')))
  expect(requests.size).toBe(0)
  await act(async()=>resolve(new Map<never,never>()))
  expect(requests.size).toBe(1);expect(hit.current).not.toBeNull()
  act(()=>{document.dispatchEvent(new Event('visibilitychange'));document.dispatchEvent(new Event('visibilitychange'))})
  expect(requests.size).toBe(1)
  view.unmount();expect(requests.size).toBe(0);expect(hit.current).toBeNull()
})
it('discards a late image load after unmount without starting animation',async()=>{
  const view=render(<PixelPetV2Renderer enhancements={DEFAULT_PIXEL_ENHANCEMENTS}/>)
  view.unmount();await act(async()=>resolve(new Map<never,never>()));expect(requests.size).toBe(0)
})
it('keeps original fallback on failed image loading and does not start animation',async()=>{
  const diagnostic=vi.fn()
  render(<PixelPetV2Renderer enhancements={DEFAULT_PIXEL_ENHANCEMENTS} onRenderError={diagnostic}/>)
  await act(async()=>reject(new Error('fixture load failure')))
  expect(screen.getByTestId('legacy-fallback')).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('加载失败')
  expect(requests.size).toBe(0)
  expect(diagnostic).toHaveBeenCalledWith(expect.objectContaining({message:'fixture load failure'}))
})
it('uses only camera or the placement baseline despite desktop and preview pointer movement',async()=>{
  const at=performance.now(),center={x:96,y:72},pointer={current:{x:10000,y:-10000}}
  const camera:{current:FaceAttention|null}={current:{present:true,x:.2,y:.1,distance:1,yaw:0,pitch:0,at}}
  render(<PixelPetV2Renderer enhancements={DEFAULT_PIXEL_ENHANCEMENTS} pointer={pointer} camera={camera} pose="bottom-edge"/>)
  await act(async()=>resolve(new Map<never,never>()))
  const frame=():RigFrame=>fake.draw.mock.calls.at(-1)![1]
  const step=(now:number)=>act(()=>{const batch=[...requests.values()];requests.clear();batch.forEach(callback=>callback(now))})
  step(at+100)
  expect(frame().gazeTarget).toEqual(cameraLook(at+100,camera.current,center,'bottom-edge')!.target)
  pointer.current={x:-10000,y:10000};camera.current=null
  fireEvent.pointerMove(screen.getByRole('img'),{clientX:999,clientY:999})
  step(at+200)
  expect(frame().gazeTarget).toEqual(restingLook(center,'bottom-edge').target)
  camera.current={present:true,x:-.4,y:-.2,distance:1,yaw:0,pitch:0,at}
  step(at+1900)
  expect(frame().gazeTarget).toEqual(restingLook(center,'bottom-edge').target)
})
it('preserves a softer live look while talking and waving, while drag/menu/pat keep priority',async()=>{
  const at=performance.now(),camera={current:{present:true,x:.5,y:.1,distance:1,yaw:0,pitch:0,at}},center={x:96,y:72}
  const props={enhancements:DEFAULT_PIXEL_ENHANCEMENTS,camera,pose:'right-edge' as const,previewPose:'wave' as const,conversation:'speaking' as const}
  const view=render(<PixelPetV2Renderer {...props}/>);await act(async()=>resolve(new Map<never,never>()))
  const step=(now:number)=>act(()=>{const batch=[...requests.values()];requests.clear();batch.forEach(callback=>callback(now))})
  step(at+100)
  const frame=():RigFrame=>fake.draw.mock.calls.at(-1)![1]
  const expected=personLook(at+100,camera.current,center,'right-edge',undefined,{pose:'wave',expression:'happy',target:null,pat:false,speaking:true},'speaking',false)
  expect(frame().gazeTarget).toEqual(expected.target);expect(frame().gazeTarget!.x).toBeGreaterThan(restingLook(center,'right-edge').target.x)
  view.rerender(<PixelPetV2Renderer {...props} engaged/>);step(at+200);expect(frame().gazeTarget).toBeNull()
  view.rerender(<PixelPetV2Renderer {...props} dragging/>);step(at+300);expect(frame().gazeTarget).toBeNull()
})
