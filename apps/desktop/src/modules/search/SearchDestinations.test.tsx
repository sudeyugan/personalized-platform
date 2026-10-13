import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSeedLibrary } from '../../domain/seed'
import { useLibraryStore } from '../../state/useLibraryStore'
import { DiaryView } from '../planner/DiaryView'
import { MusicView } from '../music/MusicView'
import { AnswerBookView } from '../answer-book/AnswerBookView'
import { CalendarScheduleView } from '../planner/CalendarScheduleView'

vi.mock('../../infrastructure/libraryRepository', () => ({ libraryRepository: { save: vi.fn().mockResolvedValue(undefined) } }))
beforeEach(() => useLibraryStore.setState({ data: createSeedLibrary(), playback: { playing: false, context: 'global', queue: [] } }))
describe('search destinations locate content without executing page actions', () => {
  it('changes an already mounted diary to the matched day and shows historic questions without writing them', () => {
    const data = useLibraryStore.getState().data
    data.planner.diaryEntries = [{ date: '2026-10-01', title: '历史日记', content: '正文', updatedAt: '' }]
    data.planner.dailyQuestions = [{ id: 'question-test', date: '2026-10-02', question: '历史朝问', background: '来由', followUp: '继续想想', topic: '日常', tone: 'balanced', createdAt: '' }]
    render(<DiaryView />)
    act(() => useLibraryStore.getState().openAgentDestination({ destination: 'diary.day', date: '2026-10-01' }))
    expect(screen.getByPlaceholderText('给今天一个标题')).toHaveValue('历史日记')
    act(() => useLibraryStore.getState().openAgentDestination({ destination: 'diary.day', date: '2026-10-02', targetId: 'question-test', section: 'daily-question' }))
    expect(screen.getByLabelText('搜索命中的朝问')).toHaveTextContent('历史朝问')
    expect(useLibraryStore.getState().data.planner.diaryEntries).toHaveLength(1)
  })
  it('highlights the music match without playing it or changing its queue', () => {
    const data = useLibraryStore.getState().data
    data.tracks = [{ id: 'track-test', title: '找到音乐', artist: '', fileName: 'test.mp3', mimeType: 'audio/mpeg', size: 1, sha256: '', createdAt: '' }]
    const queue = structuredClone(data.musicContexts)
    useLibraryStore.getState().openAgentDestination({ destination: 'music', targetId: 'track-test' })
    render(<MusicView />)
    expect(screen.getByRole('button', { name: '播放找到音乐' }).closest('article')).toHaveClass('navigation-target')
    expect(useLibraryStore.getState().playback.playing).toBe(false)
    expect(useLibraryStore.getState().data.musicContexts).toEqual(queue)
  })
  it('highlights the favorite using answer_book and opens the exact course editor', () => {
    const data = useLibraryStore.getState().data
    data.answerBook.favorites = [{ id: 'answer-test', question: '问题', answer: '收藏回答', createdAt: '2026-10-10T00:00:00Z' }]
    data.planner.courses = [{ id: 'course-test', title: '选中课程', teacher: '', location: '', weeks: '全周', day: 1, period: 1, note: '' }]
    useLibraryStore.getState().openAgentDestination({ destination: 'answer_book', targetId: 'answer-test' })
    const view = render(<AnswerBookView />)
    expect(screen.getByText('收藏回答').closest('article')).toHaveClass('navigation-target')
    view.unmount()
    useLibraryStore.getState().openAgentDestination({ destination: 'calendar.schedule', targetId: 'course-test' })
    render(<CalendarScheduleView />)
    expect(screen.getByLabelText('课程名称')).toHaveValue('选中课程')
  })
})
