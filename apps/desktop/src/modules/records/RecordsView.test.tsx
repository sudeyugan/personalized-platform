import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '../../App'

describe('record cards', () => {
  beforeEach(() => localStorage.clear())

  it('edits people, places and timeline events in a stable side panel, then deletes a person', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: '人物' }))
    fireEvent.click(await screen.findByRole('button', { name: '编辑外婆' }))
    expect(document.querySelector('.edit-modal')).not.toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: '外婆资料工作栏' })).toBeInTheDocument()
    expect(document.querySelector('.record-card.expanded')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('姓名'), { target: { value: '奶奶' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByRole('heading', { name: '奶奶' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '地点' }))
    fireEvent.click(await screen.findByRole('button', { name: '编辑旧院子' }))
    fireEvent.change(screen.getByLabelText('区域'), { target: { value: '江南' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByText('江南')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '时间线' }))
    fireEvent.click(await screen.findByRole('button', { name: '编辑搬离故乡' }))
    expect(screen.getByRole('complementary', { name: '搬离故乡资料工作栏' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('事件名称'), { target: { value: '离开故乡' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByRole('heading', { name: '离开故乡' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '删除离开故乡' }))
    expect(screen.getByRole('dialog', { name: '将事件移入回收站？' })).toBeInTheDocument()
    expect(screen.getByText('正文与资料引用')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '先保留' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '人物' }))
    fireEvent.click(screen.getByRole('button', { name: '删除奶奶' }))
    expect(screen.getByRole('dialog', { name: '将人物移入回收站？' })).toBeInTheDocument()
    expect(screen.getByText('可从回收站恢复')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '移入回收站' }))
    expect(screen.queryByRole('heading', { name: '奶奶' })).not.toBeInTheDocument()
  })
})
