import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyCompanionDesktopSnapshot } from './companionDesktop'
import { DesktopCompanionChatWindow } from './DesktopCompanionChatWindow'
const events = vi.hoisted(() => ({ handlers: new Map<string, (event: { payload: unknown }) => void>(), emit: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@tauri-apps/api/event', () => ({
  emitTo: events.emit,
  listen: (name: string, handler: (event: { payload: unknown }) => void) => {
    events.handlers.set(name, handler)
    return Promise.resolve(() => events.handlers.delete(name))
  },
}))
vi.mock('./useCompanionVoiceWake', () => ({ useCompanionVoiceWake: () => undefined }))
vi.mock('./AgentPermissionCard', () => ({ AgentPermissionCard: ({ onDecision }: { onDecision: (allowed: boolean) => void }) => <button onClick={() => onDecision(true)}>明确允许</button> }))
const send = (event: string, payload: unknown) => act(() => events.handlers.get(event)?.({ payload }))
describe('lightweight conversation', () => {
  beforeEach(() => { events.handlers.clear(); events.emit.mockClear() })
  it('preserves the draft while expanding and collapsing the same conversation', async () => {
    render(<DesktopCompanionChatWindow />)
    await waitFor(() => expect(events.handlers.has('companion:chat-presentation')).toBe(true))
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '展开完整聊天' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '未发送的草稿' } })
    fireEvent.click(screen.getByRole('button', { name: '收起为对白' }))
    fireEvent.click(screen.getByRole('button', { name: '展开完整聊天' }))
    expect(screen.getByRole('textbox')).toHaveValue('未发送的草稿')
    expect(events.emit.mock.calls.some((call) => call[1] === 'companion:chat-send')).toBe(false)
  })
  it('ends an inactive voice presentation without trapping the close button', async () => {
    render(<DesktopCompanionChatWindow />)
    await waitFor(() => expect(events.handlers.has('companion:chat-presentation')).toBe(true))
    send('companion:chat-presentation', { mode: 'voice' })
    fireEvent.click(screen.getByRole('button', { name: '结束语音对话' }))
    expect(events.emit).toHaveBeenCalledWith('main', 'companion:chat-toggle')
  })
  it('keeps a bubble presentation after expanding even with wake enabled', async () => {
    render(<DesktopCompanionChatWindow />)
    await waitFor(() => expect(events.handlers.has('companion:chat-presentation')).toBe(true))
    send('companion:snapshot', { ...emptyCompanionDesktopSnapshot, voice: { ...emptyCompanionDesktopSnapshot.voice, wakeEnabled: true } })
    fireEvent.click(screen.getByRole('button', { name: '展开完整聊天' }))
    fireEvent.click(screen.getByRole('button', { name: '收起为对白' }))
    expect(screen.getByRole('button', { name: '收起对白' })).toBeInTheDocument()
  })
  it('uses actual speech sentences and keeps explicit permission controls', async () => {
    render(<DesktopCompanionChatWindow />)
    await waitFor(() => expect(events.handlers.has('companion:speech-state')).toBe(true))
    send('companion:chat-presentation', { mode: 'voice' })
    send('companion:stream-text', { text: '模型刚生成但还没念的文字' })
    send('companion:speech-state', { active: true, text: '此刻正在朗读的句子' })
    expect(screen.getByText('此刻正在朗读的句子')).toBeInTheDocument()
    expect(screen.queryByText('模型刚生成但还没念的文字')).not.toBeInTheDocument()
    send('companion:permission-request', { requestId: 'permission-test', request: {} })
    expect(screen.getByRole('button', { name: '明确允许' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '收起为对白' })).toBeDisabled()
    expect(events.emit.mock.calls.some((call) => call[1] === 'companion:permission-response')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: '明确允许' }))
    expect(events.emit).toHaveBeenCalledWith('main', 'companion:permission-response', { requestId: 'permission-test', allowed: true })
  })
})
