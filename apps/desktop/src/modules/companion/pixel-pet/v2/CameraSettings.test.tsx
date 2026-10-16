import { act,cleanup,fireEvent,render,screen } from '@testing-library/react'
import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import { CameraSettings } from './CameraSettings'
import { readCameraPreferences,writeCameraPreferences } from './perception/CameraPreferences'
import { updateCameraStatus } from './perception/CameraStatus'
const previous={x:.45,y:.55,size:.28,deviceId:'',rangeX:.25}
let time=0
const raw=(x=.5)=>({present:true,x,y:.5,size:.28,yaw:0,pitch:0,at:time})
beforeEach(()=>{vi.useFakeTimers();localStorage.clear();time=0;vi.spyOn(performance,'now').mockImplementation(()=>time);writeCameraPreferences({enabled:true,calibration:previous});updateCameraStatus('active',raw());vi.stubGlobal('navigator',{mediaDevices:{enumerateDevices:vi.fn(async()=>[])}})})
afterEach(()=>{cleanup();updateCameraStatus('off');vi.restoreAllMocks();vi.useRealTimers();vi.unstubAllGlobals()})
async function center(){for(let index=0;index<10;index++){time=index*125;await act(async()=>{updateCameraStatus('active',raw());await Promise.resolve()})}}
it('collects stable frames before offering a center-only save, preserving old range and camera consent',async()=>{
  render(<CameraSettings/>);fireEvent.click(screen.getByRole('button',{name:'校准对视'}))
  expect(readCameraPreferences().calibration).toEqual(previous)
  expect(screen.queryByRole('button',{name:'只保存居中结果'})).toBeNull()
  await center();expect(screen.getByText('可选：身体向左轻移并停住')).toBeTruthy()
  expect(readCameraPreferences().calibration).toEqual(previous)
  fireEvent.click(screen.getByRole('button',{name:'只保存居中结果'}))
  expect(readCameraPreferences()).toMatchObject({enabled:true,calibration:{x:.5,y:.5,rangeX:.25}})
  expect(screen.getByText('居中校准已保存，未改变跟随范围。')).toBeTruthy()
  expect(localStorage.getItem('yiyu.pixel-pet.camera.v1')).not.toMatch(/yaw|pitch|present|"at"/)
})
it('cancels on explicit cancel, permission change or unmount without replacing the old calibration',async()=>{
  const view=render(<CameraSettings/>);fireEvent.click(screen.getByRole('button',{name:'校准对视'}));await center()
  fireEvent.click(screen.getByRole('button',{name:'取消校准'}));expect(readCameraPreferences().calibration).toEqual(previous)
  fireEvent.click(screen.getByRole('button',{name:'校准对视'}));act(()=>{writeCameraPreferences({enabled:false})})
  expect(screen.queryByRole('button',{name:'取消校准'})).toBeNull();expect(readCameraPreferences().calibration).toEqual(previous)
  view.unmount();await act(async()=>{await vi.advanceTimersByTimeAsync(1000)});expect(vi.getTimerCount()).toBe(0)
})
it('reports timeout and storage failure without claiming a new calibration was saved',async()=>{
  render(<CameraSettings/>);fireEvent.click(screen.getByRole('button',{name:'校准对视'}))
  time=13000;await act(async()=>{await vi.advanceTimersByTimeAsync(201)})
  expect(screen.getByText(/校准等待超时/)).toBeTruthy();expect(readCameraPreferences().calibration).toEqual(previous)
  time=0;fireEvent.click(screen.getByRole('button',{name:'校准对视'}));await center()
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('unavailable')})
  fireEvent.click(screen.getByRole('button',{name:'只保存居中结果'}));expect(screen.getByText(/校准未能保存/)).toBeTruthy()
  expect(readCameraPreferences().calibration).toEqual(previous)
})
