import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSeedLibrary } from '../../domain/seed'
import { useLibraryStore } from '../../state/useLibraryStore'
import { CompanionDesktopBridge } from './CompanionDesktopBridge'
import { DesktopCompanionWindow } from './DesktopCompanionWindow'
import { CompanionPortraitSection } from '../settings/CompanionPortraitSection'
import { emptyCompanionDesktopSnapshot, type CompanionDesktopSnapshot } from './companionDesktop'
import type { CompanionTurnOptions } from './companionConversation'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: { payload: unknown }) => void>(),
  emit: vi.fn().mockResolvedValue(undefined),
  send: vi.fn(),
  synthesize: vi.fn().mockResolvedValue(new Blob(['audio'])),
}))
vi.mock('@tauri-apps/api/event', () => ({
  emitTo: mocks.emit,
  listen: vi.fn((name: string, handler: (event: { payload: unknown }) => void) => {
    mocks.handlers.set(name, handler)
    return Promise.resolve(() => mocks.handlers.delete(name))
  }),
}))
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => '__TAURI_INTERNALS__' in window,
  convertFileSrc: (id: string) => `http://yiyu-companion.localhost/${id}`,
  invoke: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@tauri-apps/api/window', () => ({
  availableMonitors: vi.fn().mockResolvedValue([]),
  getAllWindows: vi.fn().mockResolvedValue([]),
  getCurrentWindow: () => ({
    setIgnoreCursorEvents: vi.fn().mockResolvedValue(undefined),
    setAlwaysOnTop: vi.fn().mockResolvedValue(undefined),
    outerPosition: vi.fn().mockResolvedValue({ x: 0, y: 0 }),
    outerSize: vi.fn().mockResolvedValue({ width: 200, height: 400 }),
    onMoved: vi.fn().mockResolvedValue(() => undefined),
  }),
}))
vi.mock('@tauri-apps/plugin-global-shortcut', () => ({
  register: vi.fn().mockResolvedValue(undefined),
  unregister: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./companionConversation', () => ({ sendCompanionTurn: mocks.send }))
vi.mock('./usePlannerNotifications', () => ({ usePlannerNotifications: vi.fn() }))
vi.mock('../../infrastructure/backgroundRuntime', () => ({ syncBackgroundRuntime: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../../infrastructure/companionVoiceProvider', () => ({
  createTextToSpeechProvider: () => ({ synthesize: mocks.synthesize }),
  createSpeechToTextProvider: vi.fn(),
}))

async function sendEvent(name: string, payload: unknown = {}) {
  await act(async () => {
    const handler = mocks.handlers.get(name)
    expect(handler).toBeDefined()
    handler!({ payload })
    for (let index = 0; index < 10; index++) await Promise.resolve()
  })
}
function lastSnapshot() {
  return mocks.emit.mock.calls.filter((call) => call[1] === 'companion:snapshot').at(-1)![2] as CompanionDesktopSnapshot
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-02T12:00:00'))
  mocks.handlers.clear()
  mocks.emit.mockClear()
  mocks.send.mockReset()
  mocks.synthesize.mockClear()
  vi.spyOn(Math, 'random').mockReturnValue(0)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('desktop WebM scheduler', () => {
  const snapshot: CompanionDesktopSnapshot = {
    ...emptyCompanionDesktopSnapshot,
    visual: { type: 'video', videos: {}, clips: { idle: ['base'], clothes_adjust: ['clothes'], hair_adjust: ['hair'], speaking: ['s1', 's2'] } },
  }
  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { callback(0); return 1 })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  })
  async function mount() {
    const result = render(<DesktopCompanionWindow />)
    await sendEvent('companion:snapshot', snapshot)
    return result.container
  }
  function present(container: HTMLElement) {
    const pending = container.querySelector('video.pending')!
    expect(pending).toBeTruthy()
    fireEvent.playing(pending)
    return container.querySelector('video.ready') as HTMLVideoElement
  }

  it('keeps the idle timer across snapshot refreshes and waits for a clip boundary', async () => {
    const container = await mount()
    let video = present(container)
    for (let index = 0; index < 6; index++) {
      await act(async () => vi.advanceTimersByTime(5_000))
      await sendEvent('companion:snapshot', { ...snapshot, visual: { ...snapshot.visual } })
    }
    expect(container.querySelector('video.pending')).toBeNull()
    fireEvent.ended(video)
    video = present(container)
    expect(video.src).toContain('/clothes')
    fireEvent.ended(video)
    video = present(container)
    expect(video.src).toContain('/base')
    await act(async () => vi.advanceTimersByTime(30_000))
    fireEvent.ended(video)
    expect(present(container).src).toContain('/hair')
  })

  it('immediately prioritizes interaction and rotates its clips only at the end', async () => {
    const container = await mount()
    let video = present(container)
    await act(async () => vi.advanceTimersByTime(30_000))
    fireEvent.ended(video)
    expect(present(container).src).toContain('/clothes')
    await sendEvent('companion:snapshot', { ...snapshot, action: 'speaking' })
    video = present(container)
    expect(video.src).toContain('/s1')
    expect(video.loop).toBe(false)
    fireEvent.ended(video)
    expect(present(container).src).toContain('/s2')
  })

  it('plays an explicit preview once and restores the normal state', async () => {
    const container = await mount()
    present(container)
    await sendEvent('companion:preview-video', { assetId: 'hair' })
    const video = present(container)
    expect(video.loop).toBe(false)
    expect(video.src).toContain('/hair')
    fireEvent.ended(video)
    expect(present(container).src).toContain('/base')
  })
})

describe('response expression timing', () => {
  const audio: { onended?: () => void; pause(): void }[] = []
  beforeEach(() => {
    audio.length = 0
    vi.stubGlobal('__TAURI_INTERNALS__', {})
    vi.stubGlobal('Audio', class {
      onended?: () => void
      onerror?: () => void
      constructor() { audio.push(this) }
      play() { return Promise.resolve() }
      pause() {}
      dispatchEvent() { this.onended?.(); return true }
    })
    URL.createObjectURL = vi.fn(() => 'blob:audio')
    URL.revokeObjectURL = vi.fn()
    const data = createSeedLibrary()
    data.settings.trust.externalAiProcessing = true
    data.companion.voice.autoSpeak = true
    data.companion.voice.tts = { ...data.companion.voice.tts, providerId: 'elevenlabs', voice: 'test' }
    useLibraryStore.setState({ data, ready: true, playback: { playing: true, context: 'global', queue: [] } })
    mocks.send.mockImplementation(async (_message: string, options: CompanionTurnOptions) => {
      options.onVisualState?.('celebrating')
      options.onStatus?.({ phase: 'responding' })
      return '完成了。'
    })
  })
  async function mountAndSend() {
    await act(async () => { render(<CompanionDesktopBridge />) })
    await sendEvent('companion:chat-send', { message: '庆祝一下' })
  }

  it('starts listening as soon as wake succeeds even when showing would otherwise greet', async () => {
    const data = useLibraryStore.getState().data
    data.companion.desktop.visible = false
    data.companion.desktop.visual = { type: 'video', videos: { greeting: 'greet', idle: 'base', listening: 'listen' } }
    await act(async () => { render(<CompanionDesktopBridge />) })
    expect(lastSnapshot().action).toBe('idle')
    await sendEvent('companion:voice-show-request')
    expect(useLibraryStore.getState().data.companion.desktop.visible).toBe(true)
    expect(lastSnapshot().action).toBe('listening')
    await sendEvent('companion:voice-session-ended')
    expect(lastSnapshot().action).toBe('idle')
  })

  it('clears an old expression timeout on wake and lets speaking take over', async () => {
    useLibraryStore.getState().data.companion.voice.autoSpeak = false
    await mountAndSend()
    expect(lastSnapshot().action).toBe('celebrating')
    await sendEvent('companion:voice-show-request')
    await act(async () => vi.advanceTimersByTime(15_000))
    expect(lastSnapshot().action).toBe('listening')
    await act(async () => {
      const data = useLibraryStore.getState().data
      useLibraryStore.setState({ data: { ...data, companion: { ...data.companion, voice: { ...data.companion.voice, autoSpeak: true } } } })
    })
    await sendEvent('companion:chat-send', { message: '请回答' })
    expect(lastSnapshot().action).toBe('speaking')
    await sendEvent('companion:voice-session-ended')
    expect(lastSnapshot().action).toBe('speaking')
    await act(async () => { audio[0].onended?.() })
    expect(lastSnapshot().action).toBe('celebrating')
  })

  it('keeps speaking until audio ends, then plays the selected semantic reaction', async () => {
    await mountAndSend()
    expect(lastSnapshot().action).toBe('speaking')
    expect(audio).toHaveLength(1)
    await act(async () => { audio[0].onended?.() })
    expect(lastSnapshot().action).toBe('celebrating')
    await sendEvent('companion:transient-ended', { state: 'celebrating' })
    expect(lastSnapshot().action).toBe('idle')
  })

  it('does not replay a stale reaction after the user stops speech', async () => {
    await mountAndSend()
    await sendEvent('companion:speech-stop')
    expect(lastSnapshot().action).toBe('idle')
  })

  it('shows the reaction after a text-only reply without retaining speaking', async () => {
    useLibraryStore.getState().data.companion.voice.autoSpeak = false
    await mountAndSend()
    expect(audio).toHaveLength(0)
    expect(lastSnapshot().action).toBe('celebrating')
  })

  it('forwards display-only private replies even with history enabled and resets text-only status', async () => {
    useLibraryStore.getState().data.companion.voice.autoSpeak = false
    mocks.send.mockImplementation(async (message: string, options: CompanionTurnOptions) => {
      options.onTransientMessage?.({id:'private-user',role:'user',content:message,createdAt:''})
      options.onStatus?.({phase:'responding'})
      options.onTransientMessage?.({id:'private-answer',role:'companion',content:'临时开播名单',createdAt:''})
      return '临时开播名单'
    })
    await mountAndSend()
    const displayed = mocks.emit.mock.calls.filter(call => call[1] === 'companion:transient-message').map(call => call[2])
    expect(displayed.map(message => message.role)).toEqual(['user','companion'])
    expect(displayed[1].content).toBe('临时开播名单')
    expect(lastSnapshot().agentStatus).toBeUndefined()
    expect(useLibraryStore.getState().data.companion.messages).toHaveLength(0)
  })

  it('ignores late display and stream callbacks after stop', async () => {
    useLibraryStore.getState().data.companion.voice.autoSpeak = false
    let options!: CompanionTurnOptions, finish!: (text: string) => void
    mocks.send.mockImplementation((_message: string, next: CompanionTurnOptions) => { options=next; return new Promise<string>(resolve=>{finish=resolve}) })
    await mountAndSend(); await sendEvent('companion:turn-stop')
    await act(async()=>{
      options.onTransientMessage?.({id:'late',role:'companion',content:'PRIVATE-LATE',createdAt:''})
      options.onTextDelta?.('PRIVATE-LATE'); finish('PRIVATE-LATE')
    })
    expect(JSON.stringify(mocks.emit.mock.calls)).not.toContain('PRIVATE-LATE')
    expect(lastSnapshot().agentStatus).toBeUndefined()
  })
})

describe('simplified WebM library', () => {
  it('shows eighteen slots in one list without fine-grained category folds', () => {
    useLibraryStore.setState({ data: createSeedLibrary(), ready: true })
    const { container, getByRole, getByText, queryByText } = render(<CompanionPortraitSection />)
    fireEvent.click(getByRole('button', { name: /动态 WebM/ }))
    expect(getByText('动态 WebM 动作库')).toBeInTheDocument()
    expect(container.querySelectorAll('.companion-video-slot')).toHaveLength(18)
    expect(container.querySelectorAll('.optional-video-states')).toHaveLength(0)
    expect(queryByText('放松肩膀')).not.toBeInTheDocument()
    expect(getByText('整理衣服')).toBeInTheDocument()
    expect(getByText('庆祝')).toBeInTheDocument()
  })
})
