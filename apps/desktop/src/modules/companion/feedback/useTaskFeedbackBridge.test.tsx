import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskFeedbackBridge } from './useTaskFeedbackBridge'
import { emptyCompanionDesktopSnapshot, type CompanionDesktopSnapshot } from '../companionDesktop'
import type { AgentTask } from '../../../domain/models'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: { payload: unknown }) => void>(),
  invoke: vi.fn().mockResolvedValue(undefined),
  emit: vi.fn().mockResolvedValue(undefined),
  moved: undefined as (() => void) | undefined,
  bubble: { label: 'companion-feedback', hide: vi.fn().mockResolvedValue(undefined), show: vi.fn().mockResolvedValue(undefined), setPosition: vi.fn().mockResolvedValue(undefined), setSize: vi.fn().mockResolvedValue(undefined) },
  chat: { label: 'companion-chat', show: vi.fn().mockResolvedValue(undefined), setFocus: vi.fn().mockResolvedValue(undefined) },
  placeChat: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))
vi.mock('@tauri-apps/api/event', () => ({
  emitTo: mocks.emit,
  listen: vi.fn((name: string, handler: (event: { payload: unknown }) => void) => {
    mocks.handlers.set(name, handler)
    return Promise.resolve(() => mocks.handlers.delete(name))
  }),
}))
vi.mock('../companionChatLayout', () => ({ positionCompanionChat: mocks.placeChat }))
vi.mock('@tauri-apps/api/window', () => ({
  availableMonitors: vi.fn().mockResolvedValue([{ scaleFactor: 1.5, workArea: { position: { x: -1920, y: 0 }, size: { width: 1920, height: 1080 } } }]),
  getAllWindows: vi.fn().mockResolvedValue([mocks.bubble, mocks.chat, {
    label: 'companion', outerPosition: vi.fn().mockResolvedValue({ x: -288, y: 200 }), outerSize: vi.fn().mockResolvedValue({ width: 288, height: 360 }),
    onMoved: (handler: () => void) => { mocks.moved = handler; return Promise.resolve(() => { mocks.moved = undefined }) },
  }]),
}))
const task = (status: AgentTask['status'] = 'running'): AgentTask => ({
  id: 'task', title: 'private', goal: 'private', status, currentStep: 0, artifacts: [], createdAt: '2026-10-01', updatedAt: '2026-10-04',
  steps: [{ id: 'step', title: 'private', action: 'wait', status: 'pending', failurePolicy: 'ask', durationMs: 1000 }],
})
const snapshot = (current = task()): CompanionDesktopSnapshot => ({ ...emptyCompanionDesktopSnapshot, desktopVisible: true, desktopMode: 'interactive', task: current })
const flush = async () => { await act(async () => { for (let i = 0; i < 50; i++) await Promise.resolve() }) }
const send = async (name: string, payload: unknown) => { await act(async () => { mocks.handlers.get(name)!({ payload }) }); await flush() }
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-04T12:00:00'))
  vi.stubGlobal('__TAURI_INTERNALS__', {})
  mocks.handlers.clear()
  vi.clearAllMocks()
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('desktop task feedback bridge', () => {
  it('publishes minimal state, places by DPI and opens task detail, not the main app or confirmation', async () => {
    const opened = vi.fn()
    renderHook(() => useTaskFeedbackBridge(snapshot(), opened))
    await flush()
    expect(mocks.bubble.show).toHaveBeenCalled()
    const notice = mocks.invoke.mock.calls.find(call => call[0] === 'companion_feedback_publish')![1]
    expect(JSON.stringify(notice)).not.toContain('private')
    expect(mocks.bubble.setPosition).toHaveBeenCalledWith(expect.objectContaining({ x: -666 }))
    await send('companion:feedback-details', { taskId: 'wrong' })
    expect(mocks.chat.show).not.toHaveBeenCalled()
    await send('companion:feedback-details', { taskId: 'task' })
    expect(mocks.placeChat).toHaveBeenCalled()
    expect(mocks.chat.show).toHaveBeenCalledOnce()
    expect(opened).toHaveBeenCalledOnce()
    expect(mocks.emit).toHaveBeenCalledWith('companion-chat', 'companion:task-detail', { taskId: 'task' })
    expect(mocks.emit.mock.calls.some(call => call[1] === 'companion:task-control')).toBe(false)
  })
  it('expires ordinary notices, retains confirmation and honors quiet without replay', async () => {
    const current = snapshot()
    const { rerender } = renderHook(({ value }) => useTaskFeedbackBridge(value, vi.fn()), { initialProps: { value: current } })
    await flush()
    mocks.bubble.hide.mockClear()
    await act(async () => vi.advanceTimersByTime(7000))
    await flush()
    expect(mocks.bubble.hide).toHaveBeenCalledOnce()
    const paused = task('paused')
    paused.steps[0].confirmationRequired = true
    rerender({ value: snapshot(paused) })
    await flush()
    mocks.bubble.hide.mockClear()
    await act(async () => vi.advanceTimersByTime(30_000))
    await flush()
    expect(mocks.bubble.hide).not.toHaveBeenCalled()
    rerender({ value: { ...snapshot(paused), desktopMode: 'quiet' } })
    await flush()
    expect(mocks.bubble.hide).toHaveBeenCalled()
    mocks.bubble.show.mockClear()
    rerender({ value: snapshot(paused) })
    await flush()
    expect(mocks.bubble.show).not.toHaveBeenCalled()
  })
  it('keeps a hovered notice clickable and dismissing does not cancel execution', async () => {
    renderHook(() => useTaskFeedbackBridge(snapshot(), vi.fn()))
    await flush()
    await send('companion:feedback-hover', { active: true })
    mocks.bubble.hide.mockClear()
    await act(async () => vi.advanceTimersByTime(7000))
    await flush()
    expect(mocks.bubble.hide).not.toHaveBeenCalled()
    await send('companion:feedback-dismiss', { taskId: 'task' })
    expect(mocks.bubble.hide).toHaveBeenCalled()
    expect(mocks.emit.mock.calls.some(call => call[1] === 'companion:task-control')).toBe(false)
  })
  it('cleans subscriptions and hides after a slow show finishes during unmount', async () => {
    let finish!: () => void
    mocks.bubble.show.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
    const { unmount } = renderHook(() => useTaskFeedbackBridge(snapshot(), vi.fn()))
    await flush()
    expect(finish).toBeDefined()
    unmount()
    mocks.bubble.hide.mockClear()
    finish()
    await flush()
    expect(mocks.bubble.hide).toHaveBeenCalledOnce()
    expect(mocks.handlers.size).toBe(0)
    expect(mocks.moved).toBeUndefined()
  })
})
