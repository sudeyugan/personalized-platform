import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { PageIndex } from '../../../../mobile/src/components/PageIndex'
import { CourseSchedule } from '../../../../mobile/src/planning/CourseSchedule'
import { mobilePage, parentPage } from '../../../../mobile/src/navigation'
import type { Course } from '../../domain/models'
import { frameFor } from '../../../../mobile/src/companion/figurine'

afterEach(() => { cleanup(); vi.useRealTimers() })
const course = (id: string, weeks = '1-16'): Course => ({ id, title: `课程${id}`, day: 1, period: 1, teacher: '老师', location: '教室', weeks, note: '' })

describe('mobile folio navigation', () => {
  it('keeps saved legacy locations reachable without a second landing page', () => {
    expect(mobilePage('journal')).toBe('diary')
    for (const page of ['diary', 'moods', 'courses', 'calendar', 'todos', 'assignments', 'ideas', 'chat', 'settings']) {
      expect(mobilePage(page)).toBe(page)
      expect(parentPage(page)).toBe('home')
    }
    expect(mobilePage('people')).toBe('home')
  })
  it('offers every approved function and highlights the current page', () => {
    const go = vi.fn()
    render(<PageIndex current="courses" go={go} close={vi.fn()}/> )
    const dialog = screen.getByRole('dialog', { name: '功能索引' })
    expect(within(dialog).getByRole('button', { name: /课表/ })).toHaveAttribute('aria-current', 'page')
    for (const label of ['课表', '日程', '待办', '作业', '日记', '心情与回望', '想法工坊', '和小鱼说话', '连接与设置'])
      expect(within(dialog).getByRole('button', { name: new RegExp(label) })).toBeEnabled()
    expect(within(dialog).queryByText('人物')).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: /日记/ }))
    expect(go).toHaveBeenCalledWith('diary')
  })
  it('traps focus and handles Android back without losing the underlying page', () => {
    const close = vi.fn(), focus = document.createElement('button'), app = document.createElement('div')
    app.className = 'mobile-app'; app.append(focus); document.body.append(app); focus.focus()
    const view = render(<PageIndex current="home" go={vi.fn()} close={close}/>)
    const first = screen.getByRole('button', { name: '收起功能索引' })
    expect(first).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(screen.getByRole('button', { name: /连接与设置/ })).toHaveFocus()
    const back = new Event('yiyu-back', { cancelable: true })
    window.dispatchEvent(back)
    expect(back.defaultPrevented).toBe(true); expect(close).toHaveBeenCalledOnce()
    view.unmount(); expect(focus).toHaveFocus(); app.remove()
  })
})

describe('real weekly timetable', () => {
  it('renders six periods and seven weekdays, retaining same-slot conflicts', () => {
    const edit = vi.fn()
    render(<CourseSchedule courses={[course('一'), course('二')]} edit={edit}/>)
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(7)
    expect(within(table).getAllByRole('columnheader')).toHaveLength(8)
    expect(screen.getAllByRole('button', { name: /周一第1节/ })).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: /周一第1节 课程二/ }))
    expect(edit).toHaveBeenCalledWith(course('二'))
  })
  it('filters only by the explicitly selected week and keeps all weeks as the default', () => {
    render(<CourseSchedule courses={[course('一', '1-16 单周'), course('二', '1-16 双周')]} edit={vi.fn()}/>)
    expect(screen.getAllByRole('button', { name: /周一第1节/ })).toHaveLength(2)
    fireEvent.change(screen.getByRole('combobox', { name: '课表教学周' }), { target: { value: '2' } })
    expect(screen.queryByRole('button', { name: /课程一/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /课程二/ })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: '课表教学周' }), { target: { value: '' } })
    expect(screen.getAllByRole('button', { name: /周一第1节/ })).toHaveLength(2)
  })
  it('can focus three days and return to the complete week without removing records', () => {
    render(<CourseSchedule courses={[]} edit={vi.fn()}/>)
    fireEvent.click(screen.getByRole('button', { name: '聚焦三天' }))
    expect(within(screen.getByRole('table')).getAllByRole('columnheader')).toHaveLength(4)
    fireEvent.click(within(screen.getByLabelText('聚焦星期')).getByRole('button', { name: '周日' }))
    expect(within(screen.getByRole('table')).getByRole('columnheader', { name: /周日/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '展开整周' }))
    expect(within(screen.getByRole('table')).getAllByRole('columnheader')).toHaveLength(8)
  })
})

describe('independent normal-proportioned companion frames', () => {
  it('never greets merely because the page or voice phase changed', () => {
    for (const time of [1, 100, 1000, 5500]) {
      expect(frameFor('idle', time, true)).not.toBe(4)
      expect(frameFor('listening', time, true)).toBe(2)
    }
    expect(frameFor('idle', 200, true, 100)).toBe(4)
    expect(frameFor('idle', 1400, true, 100)).not.toBe(4)
  })
  it('keeps seated poses separate from standing and respects rest/reduced motion', () => {
    expect(frameFor('idle', 200, true, 0, true)).toBe(5)
    expect(frameFor('speaking', 240, true, 0, true)).toBe(7)
    expect(frameFor('idle', 5500, false, 0, true)).toBe(5)
    expect(frameFor('idle', 200, true, 0, true, true)).toBe(6)
    expect(frameFor('idle', 200, true, 0, false, true)).toBe(1)
  })
})
