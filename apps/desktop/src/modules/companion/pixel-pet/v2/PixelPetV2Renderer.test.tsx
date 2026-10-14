import { act,render,screen } from '@testing-library/react'
import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import { DEFAULT_PIXEL_ENHANCEMENTS } from '../../../../domain/pixelPetEnhancements'
import { PixelPetV2Renderer } from './PixelPetV2Renderer'
const fake=vi.hoisted(()=>({load:vi.fn()}))
vi.mock('./rig/RigAssets',()=>({loadRigAssets:fake.load}))
vi.mock('./rig/RigRenderer',()=>({createRigRenderer:()=>({center:{x:96,y:72},draw:()=>({x:96,y:72,rx:35,ry:42})})}))
vi.mock('../PixelPetRenderer',()=>({PixelPetRenderer:()=> <canvas data-testid="legacy-fallback"/>}))
let resolve:(value:Map<never,never>)=>void,reject:(value:Error)=>void
let sequence=0,requests:Map<number,FrameRequestCallback>
beforeEach(()=>{
  sequence=0;requests=new Map()
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
