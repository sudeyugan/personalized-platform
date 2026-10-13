import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSeedLibrary } from '../../../domain/seed'
import { useLibraryStore } from '../../../state/useLibraryStore'
import { TodoView } from '../TodoView'
import { UpcomingAssignments } from './AssignmentLinks'
import { searchApplication } from '../../search/applicationSearch'

vi.mock('../../../state/persistence', () => ({ commitLibraryData: (data: unknown, set: (value: unknown) => void) => set({ data }), queueLibrarySave: vi.fn() }))
describe('minimal assignment paper UI', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-14T12:00:00')); useLibraryStore.setState({ data: createSeedLibrary() }) })
  afterEach(() => { vi.useRealTimers() })
  const add = (weekly = false) => useLibraryStore.getState().saveAssignment({ title: '阅读报告', subject: '文学', note: '附阅读笔记', rule: { repeat: weekly ? 'weekly' : 'once', startDate: weekly ? '2026-10-01' : '2026-10-15', weekdays: [5], time: '18:00' } })
  const open = () => { render(<TodoView />); fireEvent.click(screen.getByRole('button', { name: '作业' })) }
  const settings = (date = '2026-10-15') => fireEvent.click(screen.getByLabelText('本期设置 阅读报告 ' + date))
  it('adds a weekly assignment using only course and weekday, hiding optional fields', () => {
    open(); expect(screen.getByText('还没有记下作业')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '添加作业' }))
    expect(screen.getByText('更多设置 · 可选').closest('details')).not.toHaveAttribute('open')
    fireEvent.change(screen.getByLabelText('哪门课'), { target: { value: '物理' } })
    fireEvent.change(screen.getByLabelText('周几交'), { target: { value: '5' } })
    fireEvent.submit(screen.getByRole('form', { name: '新增作业' }))
    const assignment = useLibraryStore.getState().data.planner.assignments![0]
    expect(assignment).toMatchObject({ title: '物理', subject: '物理', rules: [{ repeat: 'weekly', startDate: '2026-10-12', weekdays: [5] }] })
    expect(assignment.rules[0].time).toBeUndefined()
    expect(within(screen.getByRole('region', { name: '本周作业' })).getByText('物理')).toBeInTheDocument()
    expect(screen.queryByLabelText('作业预览范围')).not.toBeInTheDocument()
    expect(screen.queryByText(/未来 21 天/)).not.toBeInTheDocument()
  })
  it('adds a single deadline with course and date only', () => {
    open(); fireEvent.click(screen.getByRole('button', { name: '添加作业' }))
    fireEvent.click(screen.getByRole('button', { name: '单次作业' }))
    fireEvent.change(screen.getByLabelText('哪门课'), { target: { value: '交互设计' } })
    fireEvent.change(screen.getByLabelText('截止日期'), { target: { value: '2027-01-15' } })
    fireEvent.submit(screen.getByRole('form', { name: '新增作业' }))
    expect(within(screen.getByRole('region', { name: '单次截止' })).getByText('2027/01/15')).toBeInTheDocument()
  })
  it('keeps deadlines visible during a holiday and renames the ordinary tab to 待办', () => {
    add(); useLibraryStore.getState().toggleTodoHoliday('2026-10-14'); open()
    expect(screen.getByText('阅读报告')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '取消今日休假' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '待办' }))
    expect(screen.getByRole('button', { name: '取消今日休假' })).toBeInTheDocument()
  })
  it('shows this week only, moves a submission to history and restores it on undo', () => {
    add(true); open()
    const current = screen.getByRole('region', { name: '本周作业' })
    expect(within(current).getByRole('button', { name: '标记已交 阅读报告 2026-10-16' })).toBeInTheDocument()
    expect(within(current).queryByRole('button', { name: /2026-10-09|2026-10-23/ })).not.toBeInTheDocument()
    fireEvent.click(within(current).getByRole('button', { name: '标记已交 阅读报告 2026-10-16' }))
    expect(within(current).queryByText('阅读报告')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('已交与往期记录'))
    fireEvent.click(screen.getByRole('button', { name: '撤销已交 阅读报告 2026-10-16' }))
    expect(within(current).getByText('阅读报告')).toBeInTheDocument()
  })
  it('reschedules, archives and restores a single assignment without losing its date', () => {
    add(); open(); settings()
    fireEvent.change(screen.getByLabelText('本期截止日期'), { target: { value: '2026-10-17' } })
    fireEvent.click(screen.getByRole('button', { name: '应用本期改期' }))
    expect(screen.getByText('2026/10/17 · 18:00')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '收起整份作业' }))
    fireEvent.click(screen.getByRole('button', { name: '确认收起' }))
    fireEvent.click(screen.getByText('收起的课程'))
    fireEvent.click(screen.getByRole('button', { name: '恢复' }))
    expect(screen.getByText('2026/10/17 · 18:00')).toBeInTheDocument()
  })
  it('finds course metadata, opens the assignment tab and excludes archives', () => {
    const id = add(), store = useLibraryStore.getState()
    expect(searchApplication(store.data, '文学 阅读').find(hit => hit.group === '作业')).toMatchObject({ section: 'assignments', targetId: id })
    store.openAgentDestination({ destination: 'todos', targetId: id }); render(<TodoView />)
    expect(screen.getByRole('button', { name: '作业' })).toHaveAttribute('aria-pressed', 'true')
    act(() => store.trashAssignment(id, true))
    expect(searchApplication(useLibraryStore.getState().data, '文学 阅读')).toEqual([])
  })
  it('shows compact homepage deadlines from this week, not earlier weekly backlog', () => {
    const id = add(true); render(<UpcomingAssignments />)
    const button = screen.getByRole('button', { name: /文学/ })
    expect(button).toHaveTextContent('10/16')
    expect(button).not.toHaveTextContent('10/09')
    fireEvent.click(button)
    expect(useLibraryStore.getState().data.session.agentNavigation).toMatchObject({ section: 'assignments', targetId: id, date: '2026-10-16' })
  })
  it('edits a single date in place, keeping its original key and submission record', () => {
    const id = add(), assignment = useLibraryStore.getState().data.planner.assignments![0], key = assignment.rules[0].id + '@2026-10-15'
    useLibraryStore.getState().setAssignmentPeriod(id, key, { submittedAt: new Date().toISOString() })
    useLibraryStore.getState().openAgentDestination({ destination: 'todos', section: 'assignments', targetId: id, date: '2026-10-15' })
    render(<TodoView />); settings()
    fireEvent.click(screen.getByRole('button', { name: '编辑课程与截止' }))
    fireEvent.change(screen.getByLabelText('截止日期'), { target: { value: '2026-10-17' } })
    fireEvent.submit(screen.getByRole('form', { name: '编辑作业' }))
    const changed = useLibraryStore.getState().data.planner.assignments![0]
    expect(changed.rules).toHaveLength(1); expect(changed.periods[key]).toMatchObject({ date: '2026-10-17', submittedAt: expect.any(String) })
    expect(changed.note).toBe('附阅读笔记')
    expect(screen.getByLabelText('本期截止日期')).toHaveValue('2026-10-17')
  })
  it('changes a weekly weekday without overwriting an already-submitted future week', () => {
    const id = add(true), assignment = useLibraryStore.getState().data.planner.assignments![0], key = assignment.rules[0].id + '@2026-10-23'
    useLibraryStore.getState().setAssignmentPeriod(id, key, { submittedAt: new Date().toISOString() })
    open(); settings('2026-10-16')
    fireEvent.click(within(screen.getByRole('region', { name: '本周作业' })).getByRole('button', { name: '编辑课程与截止' }))
    fireEvent.change(screen.getByLabelText('周几交'), { target: { value: '4' } })
    expect(screen.getByText(/调整从 2026-10-24/)).toBeInTheDocument()
    fireEvent.submit(screen.getByRole('form', { name: '编辑作业' }))
    const changed = useLibraryStore.getState().data.planner.assignments![0]
    expect(changed.periods[key].submittedAt).toBeTruthy()
    expect(changed.rules.at(-1)).toMatchObject({ startDate: '2026-10-24', weekdays: [4] })
  })
  it('opens an explicit calendar target beyond this week without adding other future weeks', () => {
    const id = add(true)
    useLibraryStore.getState().openAgentDestination({ destination: 'todos', section: 'assignments', targetId: id, date: '2026-10-23' })
    render(<TodoView />)
    expect(within(screen.getByRole('region', { name: '定位的记录' })).getByRole('button', { name: '标记已交 阅读报告 2026-10-23' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: '本周作业' })).queryByRole('button', { name: /2026-10-23/ })).not.toBeInTheDocument()
  })
})
