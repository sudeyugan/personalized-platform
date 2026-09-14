import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog'

describe('ConfirmDialog', () => {
  it('keeps the safe action focused and confirms explicitly', () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    render(<ConfirmDialog title="永久删除人物？" subject="外婆" description="资料关系会一并清理。" confirmLabel="永久删除" permanent facts={[{ label: '正文引用', value: '2 处' }]} onCancel={onCancel} onConfirm={onConfirm} />)
    expect(screen.getByRole('dialog', { name: '永久删除人物？' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '先保留' })).toHaveFocus()
    expect(screen.getByText('2 处')).toBeInTheDocument()
    const dangerButton = screen.getByRole('button', { name: '永久删除' })
    dangerButton.focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(screen.getByRole('button', { name: '关闭确认框' })).toHaveFocus()
    fireEvent.click(dangerButton)
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('cancels with Escape', () => {
    const onCancel = vi.fn()
    render(<ConfirmDialog title="删除地点？" subject="旧院子" description="会先进入回收站。" confirmLabel="移入回收站" onCancel={onCancel} onConfirm={vi.fn()} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
