import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSeedLibrary } from '../../domain/seed'
import { useLibraryStore } from '../../state/useLibraryStore'
import { TakeoverPanel } from './TakeoverPanel'
import { takeoverRequestEvent } from './types'

const calls = vi.hoisted(() => ({ start: vi.fn(async () => undefined), stop: vi.fn(async () => undefined), execute: vi.fn(async () => [{ windowId: 'f1', title: '虚构搜索窗口', processId: 1 }]) }))
vi.mock('./useTakeover', () => ({ useTakeover: () => ({ progress: { phase: 'idle', actions: 0, message: '' }, start: calls.start, stop: calls.stop, pause: vi.fn(), resume: vi.fn(), confirm: vi.fn(), decision: vi.fn() }) }))
vi.mock('../../infrastructure/computerService', () => ({ createComputerService: () => ({ execute: calls.execute }) }))
function prepare(goal = '') { act(() => window.dispatchEvent(new CustomEvent(takeoverRequestEvent, { detail: { goal } }))) }
beforeEach(() => { vi.clearAllMocks(); const data = createSeedLibrary(); data.companion.computer.enabled = true; useLibraryStore.setState({ data }) })
describe('explicit takeover start', () => {
  it('prepares a panel without reading windows or starting any operation', () => {
    render(<TakeoverPanel />); expect(screen.queryByLabelText('受控电脑接管')).not.toBeInTheDocument()
    prepare('查找报告')
    expect(screen.getByLabelText('受控电脑接管')).toBeInTheDocument()
    expect(calls.execute).not.toHaveBeenCalled(); expect(calls.start).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '开始本次任务' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: /同意本任务/ })).not.toBeChecked()
  })
  it('requires a selected window and fresh consent, with observe-only default', async () => {
    render(<TakeoverPanel />); prepare('查找报告')
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    await screen.findByRole('option', { name: '虚构搜索窗口' })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'f1' } })
    expect(screen.getByRole('button', { name: '开始本次任务' })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: /同意本任务/ }))
    fireEvent.click(screen.getByRole('button', { name: '开始本次任务' }))
    await waitFor(() => expect(calls.start).toHaveBeenCalledWith('f1', '查找报告', false, true))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '新目标' } })
    expect(screen.getByRole('checkbox', { name: /同意本任务/ })).not.toBeChecked()
  })
  it('does not grant access and clears consent when the requested target changes', async () => {
    render(<TakeoverPanel />); prepare('目标一')
    fireEvent.click(screen.getByRole('checkbox', { name: /同意本任务/ }))
    prepare('目标二')
    expect(screen.getByRole('textbox')).toHaveValue('目标二')
    expect(screen.getByRole('checkbox', { name: /同意本任务/ })).not.toBeChecked()
    expect(useLibraryStore.getState().data.companion.computer.grants).toHaveLength(0)
    expect(calls.start).not.toHaveBeenCalled()
  })
  it('stops the session before dismissing the panel', async () => {
    render(<TakeoverPanel />); prepare()
    fireEvent.click(screen.getByRole('button', { name: '停止并关闭接管' }))
    await waitFor(() => expect(screen.queryByLabelText('受控电脑接管')).not.toBeInTheDocument())
    expect(calls.stop).toHaveBeenCalledTimes(1)
  })
})
