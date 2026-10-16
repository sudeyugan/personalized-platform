import { act,renderHook } from '@testing-library/react'
import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import { useScreenLook } from './useScreenLook'
const mock=vi.hoisted(()=>({position:vi.fn(),size:vi.fn(),monitors:vi.fn(),events:new Map<string,()=>void>(),off:vi.fn()}))
vi.mock('@tauri-apps/api/core',()=>({isTauri:()=>true}))
vi.mock('@tauri-apps/api/window',()=>({availableMonitors:mock.monitors,getCurrentWindow:()=>({outerPosition:mock.position,outerSize:mock.size,...Object.fromEntries(['onMoved','onResized','onScaleChanged'].map(key=>[key,async(fn:()=>void)=>{mock.events.set(key,fn);return mock.off}]))})}))
beforeEach(()=>{
  vi.useFakeTimers();mock.events.clear();mock.off.mockReset()
  mock.position.mockReset().mockResolvedValue({x:100,y:200});mock.size.mockReset().mockResolvedValue({width:192,height:240})
  mock.monitors.mockReset().mockResolvedValue([{scaleFactor:1,position:{x:0,y:0},size:{width:1920,height:1080},workArea:{position:{x:0,y:0},size:{width:1920,height:1040}}}])
})
afterEach(()=>vi.useRealTimers())
it('only samples own physical geometry when active or notified, without stationary polling',async()=>{
  const {result,rerender,unmount}=renderHook(({active})=>useScreenLook(active),{initialProps:{active:false}})
  expect(mock.position).not.toHaveBeenCalled();rerender({active:true})
  await act(async()=>{await vi.advanceTimersByTimeAsync(1)})
  expect(result.current.current?.window.position).toEqual({x:100,y:200})
  await act(async()=>{await vi.advanceTimersByTimeAsync(2000)})
  expect(mock.position).toHaveBeenCalledTimes(1)
  mock.position.mockResolvedValue({x:300,y:500})
  act(()=>{mock.events.get('onMoved')!();mock.events.get('onMoved')!();mock.events.get('onScaleChanged')!()})
  await act(async()=>{await vi.advanceTimersByTimeAsync(101)})
  expect(mock.position).toHaveBeenCalledTimes(2);expect(result.current.current?.window.position).toEqual({x:300,y:500})
  rerender({active:false});expect(result.current.current).toBeNull();expect(mock.off).toHaveBeenCalledTimes(3)
  unmount();expect(vi.getTimerCount()).toBe(0)
})
it('drops late results after disabling rather than publishing old placement',async()=>{
  let finish!:(value:unknown)=>void;mock.position.mockImplementation(()=>new Promise(resolve=>{finish=resolve}))
  const {result,rerender,unmount}=renderHook(({active})=>useScreenLook(active),{initialProps:{active:true}})
  rerender({active:false});await act(async()=>{finish({x:100,y:200});await Promise.resolve()})
  expect(result.current.current).toBeNull();unmount()
})
