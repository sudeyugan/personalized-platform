import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { CalendarAgenda } from '../../../../mobile/src/planning/CalendarAgenda'
import { FolioLinks } from '../../../../mobile/src/components/FolioLinks'
import { DiaryPage } from '../../../../mobile/src/pages/DiaryPage'
import type { CalendarEvent } from '../../domain/models'

afterEach(cleanup)
const appointments = [
  { id: 'a', title: '先讨论', date: '2026-10-30', time: '09:00', note: '虚构记录' },
  { id: 'b', title: '后整理', date: '2026-10-30', time: '14:00', note: '' },
  { id: 'c', title: '另外一天', date: '2026-10-31', time: '10:00', note: '' },
] as CalendarEvent[]

describe('tablet calendar and common directory', () => {
  it('selects days without navigating and keeps agenda ordered, editable and removable', () => {
    const edit = vi.fn(), remove = vi.fn()
    function Fixture() {
      const [date, setDate] = useState('2026-10-30'), [month, setMonth] = useState(new Date(2026, 9, 1))
      return <CalendarAgenda appointments={appointments} date={date} month={month} setDate={setDate} setMonth={setMonth} edit={edit} remove={remove}/>
    }
    render(<Fixture />)
    const agenda = screen.getByRole('region', { name: '当天日程' })
    expect(within(agenda).getAllByRole('heading', { level: 3 }).map(element => element.textContent)).toEqual(['2026-10-30', '先讨论', '后整理'])
    fireEvent.click(within(agenda).getAllByRole('button', { name: '编辑' })[0])
    expect(edit).toHaveBeenCalledWith(appointments[0])
    fireEvent.click(within(agenda).getAllByRole('button', { name: '移除' })[1])
    expect(remove).toHaveBeenCalledWith('calendar/b')
    fireEvent.click(screen.getByRole('button', { name: '2026-10-31' }))
    expect(within(agenda).getByRole('heading', { name: '另外一天' })).toBeInTheDocument()
    expect(within(agenda).queryByRole('heading', { name: '先讨论' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '下个月' }))
    expect(screen.getByRole('heading', { name: '2026 年 11 月' })).toBeInTheDocument()
    expect(within(agenda).getByRole('heading', { name: '另外一天' })).toBeInTheDocument()
  })
  it('shares exactly the approved entries, with one active location and no excluded modules', () => {
    const go = vi.fn()
    render(<FolioLinks current="diary" go={go}/>)
    expect(screen.getAllByRole('button')).toHaveLength(10)
    expect(screen.getByRole('button', { name: /日记/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByText('人物')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /课表/ }))
    expect(go).toHaveBeenCalledWith('courses')
  })
  it('keeps diary index selection and full content in one reading workspace', () => {
    render(<DiaryPage records={{ 'diary/2026-10-29': { date: '2026-10-29', title: '昨日手记', content: '完整的一段文字。' } }} action={async job => { await job() }}/>)
    fireEvent.click(within(screen.getByRole('complementary', { name: '日记索引' })).getByRole('button', { name: /昨日手记/ }))
    expect(screen.getByRole('article', { name: '2026-10-29的日记' })).toHaveTextContent('完整的一段文字。')
    expect(screen.getByRole('button', { name: /昨日手记/ })).toHaveAttribute('aria-pressed', 'true')
  })
})
