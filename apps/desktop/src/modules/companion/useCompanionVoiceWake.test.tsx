import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyCompanionDesktopSnapshot } from './companionDesktop'
import { useCompanionVoiceWake } from './useCompanionVoiceWake'
import { localVoice } from '../../infrastructure/localVoice'
const mocks = vi.hoisted(() => ({ detected: undefined as undefined | ((result: { detected: boolean; speakerMatched: boolean }) => void), feed: undefined as undefined | ((samples: number[]) => void), callbacks: undefined as undefined | { ready: () => void; partial: (text: string) => void; committed: (text: string) => void }, stop: vi.fn(), open: vi.fn(), emit: vi.fn(), close: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ emitTo: mocks.emit.mockResolvedValue(undefined) }))
vi.mock('../../infrastructure/localVoice', () => ({ localVoice: { monitor: vi.fn(async (_config, detected) => { mocks.detected = detected; return { isActive: () => true, stop: mocks.stop, handoff: (feed: (samples: number[]) => void) => { mocks.feed = feed } } }) } }))
vi.mock('./voiceRecognition', () => ({ openVoiceRecognition: mocks.open.mockImplementation((_token, _audio, callbacks) => { mocks.callbacks = callbacks; return { close: mocks.close } }) }))
const options = () => ({ voice: { ...emptyCompanionDesktopSnapshot.voice, wakeEnabled: true, sttProviderId: 'elevenlabs' as const }, agentBusy: { current: false }, speechBusy: { current: false }, spokenText: { current: '' }, requestToken: vi.fn().mockResolvedValue('temporary'), setSpeechNote: vi.fn() })
describe('voice session boundaries', () => {
  beforeEach(() => { vi.useFakeTimers(); mocks.detected = undefined; mocks.feed = undefined; mocks.callbacks = undefined; mocks.open.mockClear(); mocks.stop.mockClear(); mocks.close.mockClear(); mocks.emit.mockClear() })
  afterEach(() => vi.useRealTimers())
  it('restarts settings without accepting a late wake from the old sensitivity',async()=>{
    const props=options(),hook=renderHook(({voice})=>useCompanionVoiceWake({...props,voice}),{initialProps:{voice:props.voice}})
    await act(async()=>{});const old=mocks.detected
    hook.rerender({voice:{...props.voice,wakeSensitivity:'high'}});await act(async()=>{})
    act(()=>old?.({detected:true,speakerMatched:true}));expect(props.requestToken).not.toHaveBeenCalled()
    expect(localVoice.monitor).toHaveBeenLastCalledWith(expect.objectContaining({wakeSensitivity:'high'}),expect.any(Function),expect.any(Function),expect.any(Function))
    await act(async()=>mocks.detected?.({detected:true,speakerMatched:true}));expect(props.requestToken).toHaveBeenCalledOnce();hook.unmount()
  })
  it('closes the old cloud session and discards its commits when microphone preferences change',async()=>{
    const props=options(),hook=renderHook(()=>useCompanionVoiceWake(props));await act(async()=>{})
    await act(async()=>mocks.detected?.({detected:true,speakerMatched:true}));const old=mocks.callbacks
    act(()=>window.dispatchEvent(new Event('yiyu:microphone-changed')));await act(async()=>vi.advanceTimersByTime(181))
    expect(mocks.close).toHaveBeenCalledOnce();mocks.emit.mockClear()
    act(()=>old?.committed('旧麦克风迟到的私人话语'))
    expect(mocks.emit.mock.calls.some(([,event])=>event==='companion:chat-send')).toBe(false)
    hook.unmount()
  })
  it('does not open cloud recognition when a token arrives after configuration replacement',async()=>{
    let done!:(value:string)=>void
    const props=options();props.requestToken.mockReturnValue(new Promise(resolve=>{done=resolve}))
    const hook=renderHook(({voice})=>useCompanionVoiceWake({...props,voice}),{initialProps:{voice:props.voice}});await act(async()=>{})
    act(()=>mocks.detected?.({detected:true,speakerMatched:true}));hook.rerender({voice:{...props.voice,wakeEnabled:false}})
    await act(async()=>done('late-token'));expect(mocks.open).not.toHaveBeenCalled();hook.unmount()
  })
  it('retries startup microphone failures only three times without requesting a cloud token',async()=>{
    const monitor=vi.mocked(localVoice.monitor);monitor.mockRejectedValueOnce(new Error('device')).mockRejectedValueOnce(new Error('device')).mockRejectedValueOnce(new Error('device')).mockRejectedValueOnce(new Error('device'))
    const props=options(),hook=renderHook(()=>useCompanionVoiceWake(props));await act(async()=>{})
    for(const delay of [2001,4001,6001,20000])await act(async()=>vi.advanceTimersByTime(delay))
    expect(props.requestToken).not.toHaveBeenCalled();expect(props.setSpeechNote).toHaveBeenLastCalledWith(expect.stringContaining('本地唤醒暂不可用'))
    hook.unmount()
  })
  it('does not connect on rejected speaker and hands off after a verified wake', async () => {
    const props = options()
    const { unmount } = renderHook(() => useCompanionVoiceWake(props))
    await act(async () => {})
    act(() => mocks.detected?.({ detected: true, speakerMatched: false }))
    expect(props.requestToken).not.toHaveBeenCalled()
    await act(async () => mocks.detected?.({ detected: true, speakerMatched: true }))
    expect(mocks.stop).not.toHaveBeenCalled()
    expect(mocks.feed).toBeTruthy()
    expect(mocks.open).toHaveBeenCalledOnce()
    unmount()
    expect(mocks.stop).toHaveBeenCalledOnce()
  })
  it('never treats the fifteen-second waiting window as a playback limit', async () => {
    const props = options()
    renderHook(() => useCompanionVoiceWake(props))
    await act(async () => {})
    await act(async () => mocks.detected?.({ detected: true, speakerMatched: true }))
    act(() => { mocks.callbacks?.ready(); props.speechBusy.current = true })
    await act(async () => vi.advanceTimersByTime(45000))
    expect(mocks.close).not.toHaveBeenCalled()
    expect(mocks.emit.mock.calls.some(([, event]) => event === 'companion:speech-stop')).toBe(false)
  })
  it('keeps collecting an active utterance and accepts intentional interruption', async () => {
    const props = options()
    renderHook(() => useCompanionVoiceWake(props))
    await act(async () => {})
    await act(async () => mocks.detected?.({ detected: true, speakerMatched: true }))
    act(() => mocks.callbacks?.ready())
    await act(async () => vi.advanceTimersByTime(14000))
    act(() => mocks.callbacks?.partial('我还在说这个问题'))
    await act(async () => vi.advanceTimersByTime(2000))
    expect(mocks.close).not.toHaveBeenCalled()
    props.speechBusy.current = true
    act(() => mocks.callbacks?.committed('请改为打开日历'))
    expect(mocks.emit).toHaveBeenCalledWith('main', 'companion:speech-stop', {})
    expect(mocks.emit).toHaveBeenCalledWith('main', 'companion:chat-send', { message: '请改为打开日历', inputMode: 'voice', wake: true, replace: true })
  })
  it('resumes a provisional interruption if STT never commits a new utterance', async () => {
    const props = options()
    renderHook(() => useCompanionVoiceWake(props))
    await act(async () => {})
    await act(async () => mocks.detected?.({ detected: true, speakerMatched: true }))
    props.speechBusy.current = true
    act(() => mocks.callbacks?.partial('我有一个问题'))
    await act(async () => vi.advanceTimersByTime(600))
    act(() => mocks.callbacks?.partial('我有一个问题需要问你'))
    expect(mocks.emit).toHaveBeenCalledWith('main', 'companion:speech-pause', { paused: true })
    await act(async () => vi.advanceTimersByTime(8100))
    expect(mocks.emit).toHaveBeenCalledWith('main', 'companion:speech-pause', { paused: false })
  })
})
