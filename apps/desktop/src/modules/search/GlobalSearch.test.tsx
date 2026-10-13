import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSeedLibrary } from '../../domain/seed'
import { useLibraryStore } from '../../state/useLibraryStore'
import { GlobalSearch } from './GlobalSearch'

vi.mock('../../infrastructure/libraryRepository', () => ({ libraryRepository: { save: vi.fn().mockResolvedValue(undefined) } }))
beforeEach(() => { vi.useFakeTimers(); useLibraryStore.setState({ data: createSeedLibrary() }) })
afterEach(() => vi.useRealTimers())
const query = async (text: string) => {
  fireEvent.change(screen.getByRole('textbox', { name: '搜索整个程序' }), { target: { value: text } })
  await act(async () => vi.advanceTimersByTime(120))
}
describe('whole application search navigation', () => {
  it('supports keyboard selection and opens the exact diary date', async () => {
    const data = useLibraryStore.getState().data
    data.planner.diaryEntries = [{ date: '2026-10-01', title: '唯一日记', content: '感想', updatedAt: '' }]
    const onClose = vi.fn(); render(<GlobalSearch onClose={onClose} />)
    await query('唯一日记')
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    expect(useLibraryStore.getState().data.session).toMatchObject({ activeView: 'diary', activeDiaryDate: '2026-10-01' })
    expect(onClose).toHaveBeenCalledOnce()
  })
  it('opens settings categories and answer favorites through their canonical destinations', async () => {
    render(<GlobalSearch onClose={vi.fn()} />)
    await query('备份')
    fireEvent.click(screen.getByRole('button', { name: /数据管理/ }))
    expect(useLibraryStore.getState().data.session.agentNavigation).toMatchObject({ destination: 'settings', section: 'data' })
  })
  it('hides rendered excerpts immediately after locking and refuses stale clicks', async () => {
    const data = useLibraryStore.getState().data, chapter = Object.values(data.chapters)[0]
    chapter.plainText = '不会泄露的唯一正文'; const owner = chapter.workId
    const onClose = vi.fn(); render(<GlobalSearch onClose={onClose} />)
    await query('不会泄露的唯一正文')
    const button = screen.getByRole('button', { name: new RegExp(chapter.title) })
    act(() => useLibraryStore.setState({ data: { ...data, works: data.works.map(work => work.id === owner ? { ...work, locked: true } : work) } }))
    expect(screen.queryByText(/不会泄露的唯一正文/)).not.toBeInTheDocument()
    fireEvent.click(button)
    expect(onClose).not.toHaveBeenCalled()
  })
  it('does not close the dialog on an IME composing Escape', () => {
    const onClose = vi.fn(); render(<GlobalSearch onClose={onClose} />)
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape', isComposing: true })
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
