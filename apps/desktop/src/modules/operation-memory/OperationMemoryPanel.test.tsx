import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OperationMemoryPanel } from './OperationMemoryPanel'
import { openOperationMemory } from './events'
import { createSeedLibrary } from '../../domain/seed'
import { useLibraryStore } from '../../state/useLibraryStore'
import { learned } from '../../domain/operations/fixtures'
import { operationDraftOf } from '../../domain/operations/catalog'
import { takeoverRequestEvent } from '../computer-takeover/types'

const calls = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock('../companion/companionConversation', () => ({ sendCompanionTurn: calls.send }))
vi.mock('../../infrastructure/libraryRepository', () => ({ libraryRepository: { save: vi.fn().mockResolvedValue(undefined) } }))
beforeEach(() => { vi.clearAllMocks(); const data = createSeedLibrary(); data.companion.operations = [learned()]; useLibraryStore.setState({ data, saveStatus: 'idle' }) })
function openLibrary() { act(() => openOperationMemory({ mode: 'library' })) }
function chooseMethod() { openLibrary(); fireEvent.click(screen.getByRole('button', { name: '使用方法 查询公开资料' })) }
describe('reviewable methods UI', () => {
  it('does not run on opening or choosing a method; asks for parameters and consent', () => {
    render(<OperationMemoryPanel />); chooseMethod()
    expect(calls.send).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: '开始本次任务' })).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox', { name: '本次关键词' }), { target: { value: '新资料' } })
    expect(screen.getByRole('button', { name: '开始本次任务' })).toBeDisabled()
    expect(screen.getByText(/本次结果|结果不保存/u)).toBeInTheDocument()
  })
  it('executes only after explicit start and stores metadata pending user review, not private result', async () => {
    calls.send.mockImplementation(async (_message, options) => { options.onOperationReceipt('awaiting_review', 2); return 'PRIVATE-RESULT-BODY' })
    render(<OperationMemoryPanel />); chooseMethod()
    fireEvent.change(screen.getByRole('textbox', { name: '本次关键词' }), { target: { value: '当前资料' } })
    fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: '开始本次任务' }))
    await screen.findByText('PRIVATE-RESULT-BODY')
    expect(calls.send.mock.calls[0][1].operation.parameters).toEqual({ 关键词: '当前资料' })
    expect(JSON.stringify(useLibraryStore.getState().data.companion.operations)).not.toContain('PRIVATE-RESULT-BODY')
    expect(useLibraryStore.getState().data.companion.operations![0].runs[0].status).toBe('awaiting_review')
    fireEvent.click(screen.getByRole('button', { name: '我已核对，确实完成' }))
    expect(useLibraryStore.getState().data.companion.operations![0].runs[0].status).toBe('confirmed')
  })
  it('does not silently overwrite a method that was edited elsewhere', () => {
    render(<OperationMemoryPanel />); openLibrary(); fireEvent.click(screen.getByRole('button', { name: '编辑方法 查询公开资料' }))
    act(() => { const item = useLibraryStore.getState().data.companion.operations![0]; useLibraryStore.getState().saveOperation({ ...operationDraftOf(item), title: '别处的新版本' }, item.id, item.revision) })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: '核对并保存方法' }))
    expect(screen.getByRole('alert')).toHaveTextContent('方法已改变')
    expect(useLibraryStore.getState().data.companion.operations![0].title).toBe('别处的新版本')
  })
  it('prepares a window method without reading windows or executing, then closes the library', () => {
    const data = createSeedLibrary(); data.companion.operations = [learned({ scope: 'window' })]; useLibraryStore.setState({ data })
    const listener = vi.fn(); window.addEventListener(takeoverRequestEvent, listener)
    render(<OperationMemoryPanel />); chooseMethod()
    fireEvent.change(screen.getByRole('textbox', { name: '本次关键词' }), { target: { value: '报告' } })
    fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: '准备窗口任务' }))
    expect(listener).toHaveBeenCalledOnce(); expect(calls.send).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    window.removeEventListener(takeoverRequestEvent, listener)
  })
  it('stops a pending request when closed and ignores its late content', async () => {
    let release!: (value: string) => void
    calls.send.mockImplementation(async (_message, options) => { await new Promise<string>(resolve => { release = resolve }); if (options.signal.aborted) throw new Error('cancelled'); return 'LATE-BODY' })
    render(<OperationMemoryPanel />); chooseMethod()
    fireEvent.change(screen.getByRole('textbox', { name: '本次关键词' }), { target: { value: '信息' } })
    fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: '开始本次任务' }))
    fireEvent.click(screen.getByRole('button', { name: '停止并关闭操作记忆' }))
    await act(async () => release(''))
    await waitFor(() => expect(useLibraryStore.getState().data.companion.operations![0].runs[0].status).toBe('cancelled'))
    expect(screen.queryByText('LATE-BODY')).not.toBeInTheDocument()
  })
})
