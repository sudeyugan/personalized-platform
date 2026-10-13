import { act,cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest'
import { createSeedLibrary } from '../../domain/seed'
import { useLibraryStore } from '../../state/useLibraryStore'
import { CompanionVoiceSettings } from './CompanionVoiceSettings'
import { MicrophoneSettings } from './MicrophoneSettings'
const mocks=vi.hoisted(()=>({stop:vi.fn(async()=>{}),capture:vi.fn(),listeners:new Map<string,(event:{payload:{level:number}})=>void>(),emit:vi.fn(async()=>{})}))
vi.mock('@tauri-apps/api/event',()=>({listen:vi.fn(async(name,callback)=>{mocks.listeners.set(name,callback);return()=>mocks.listeners.delete(name)}),emitTo:mocks.emit}))
vi.mock('../../infrastructure/companionVoiceProvider',()=>({hasCompanionVoiceKey:async()=>true,deleteCompanionVoiceKey:vi.fn(),storeCompanionVoiceKey:vi.fn()}))
vi.mock('../../infrastructure/localVoice',()=>({openPcmCapture:mocks.capture,captureSpeakerSample:vi.fn(),localVoice:{status:async()=>({modelsInstalled:true,speakerEnrolled:true,modelBytes:1}),subscribeInstall:()=>()=>{},stop:mocks.stop,deleteProfile:async()=>({modelsInstalled:true,speakerEnrolled:false,modelBytes:1})}}))
beforeEach(()=>{
  vi.clearAllMocks();localStorage.clear();mocks.listeners.clear();Object.defineProperty(window,'__TAURI_INTERNALS__',{value:{},configurable:true})
  Object.defineProperty(navigator,'mediaDevices',{value:{enumerateDevices:async()=>[{kind:'audioinput',deviceId:'fixture-device',label:'测试麦克风'}]},configurable:true})
  const data=createSeedLibrary();data.companion.voice.stt.providerId='elevenlabs';data.companion.voice.tts.providerId='elevenlabs';data.companion.voice.wakeEnabled=true;useLibraryStore.setState({data,saveStatus:'idle'})
})
afterEach(()=>{cleanup();delete (window as unknown as Record<string,unknown>).__TAURI_INTERNALS__})
describe('wake settings remain editable during listening',()=>{
  it('changes sensitivity and speaker requirement without locking their controls',async()=>{
    render(<CompanionVoiceSettings/>);await screen.findByText('本地模型和声纹均已就绪。')
    const sensitivity=screen.getByRole('combobox',{name:'唤醒灵敏度'});expect(sensitivity).toBeEnabled();fireEvent.change(sensitivity,{target:{value:'high'}})
    expect(useLibraryStore.getState().data.companion.voice.wakeSensitivity).toBe('high');expect(useLibraryStore.getState().data.companion.voice.wakeEnabled).toBe(true)
    fireEvent.click(screen.getByRole('button',{name:'只响应已录入的声音'}));expect(useLibraryStore.getState().data.companion.voice.speakerVerification).toBe(false)
    expect(screen.getByRole('button',{name:'重新录入声纹'})).toBeEnabled();fireEvent.click(screen.getByRole('button',{name:'删除声纹'}))
    await waitFor(()=>expect(useLibraryStore.getState().data.companion.voice.wakeEnabled).toBe(false))
  })
  it('commits a valid name on blur and preserves active wake when typing a partial name',async()=>{
    render(<CompanionVoiceSettings/>);await screen.findByText('本地模型和声纹均已就绪。');const name=screen.getByRole('textbox',{name:'伙伴唤醒名'})
    fireEvent.change(name,{target:{value:'阿'}});expect(useLibraryStore.getState().data.companion.voice.wakeEnabled).toBe(true);fireEvent.blur(name)
    expect(useLibraryStore.getState().data.companion.name).toBe('小鱼');expect(screen.getByText(/当前名字尚未修改/)).toBeInTheDocument()
    fireEvent.change(name,{target:{value:'阿璃'}});fireEvent.blur(name);expect(useLibraryStore.getState().data.companion.name).toBe('阿璃');expect(useLibraryStore.getState().data.companion.voice.wakeEnabled).toBe(true)
  })
  it('shares the active meter without opening another microphone and signals input changes',async()=>{
    render(<MicrophoneSettings wakeEnabled/>);await waitFor(()=>expect(mocks.listeners.has('companion:local-voice-level')).toBe(true))
    await act(async()=>mocks.listeners.get('companion:local-voice-level')?.({payload:{level:0.6}}))
    expect(screen.getByLabelText('本地麦克风音量')).toHaveAttribute('value','0.6')
    fireEvent.click(screen.getByRole('button',{name:'查看监听音量'}));await screen.findByText(/没有另开麦克风/);expect(mocks.capture).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole('combobox',{name:'收音设备'}),{target:{value:'fixture-device'}})
    fireEvent.change(screen.getByLabelText('本地收音增益'),{target:{value:'1.5'}})
    expect(mocks.emit).toHaveBeenCalledWith('companion-chat','companion:microphone-changed',{})
    expect(JSON.parse(localStorage.getItem('yiyu:microphone-preferences')!)).toEqual({deviceId:'fixture-device',gain:1.5})
  })
})
