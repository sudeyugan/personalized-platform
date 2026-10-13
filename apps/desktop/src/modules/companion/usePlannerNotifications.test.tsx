import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSeedLibrary } from '../../domain/seed'
import { usePlannerNotifications } from './usePlannerNotifications'

const execute = vi.hoisted(() => vi.fn().mockResolvedValue({ success: true }))
vi.mock('../../infrastructure/computerService', () => ({ createComputerService: () => ({ execute }) }))
function Fixture({ data }: { data: ReturnType<typeof createSeedLibrary> }) { usePlannerNotifications(data); return null }
describe('assignment deadline notifications', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-11T23:35:00')); Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} }); localStorage.clear(); execute.mockClear() })
  afterEach(() => { vi.useRealTimers(); Reflect.deleteProperty(window, '__TAURI_INTERNALS__') })
  const fixture = () => {
    const data = createSeedLibrary(); data.companion.computer.enabled = true; data.companion.computer.backgroundReminders = true; data.companion.computer.reminderLeadMinutes = 30
    data.planner.assignments = [{ id: 'paper', title: '课程论文', subject: '', note: '', createdAt: '', rules: [{ id: 'once', repeat: 'once', startDate: '2026-10-11', weekdays: [] }], periods: {} }]
    return data
  }
  it('uses day-end deadlines and deduplicates notification delivery', () => {
    render(<Fixture data={fixture()} />)
    expect(execute).toHaveBeenCalledWith({ action: 'notify', params: { title: '作业即将截止', body: '课程论文 · 2026/10/11 · 当天结束' } }, true)
    act(() => vi.advanceTimersByTime(90_000)); expect(execute).toHaveBeenCalledTimes(1)
  })
  it('does not enable notification permissions itself', () => {
    const data = fixture(); data.companion.computer.backgroundReminders = false
    render(<Fixture data={data} />); expect(execute).not.toHaveBeenCalled()
  })
  it('does not notify submitted, skipped, archived or long overdue periods', () => {
    const data = fixture(); const base = data.planner.assignments![0]
    data.planner.assignments = [{ ...base, periods: { 'once@2026-10-11': { submittedAt: new Date().toISOString() } } }, { ...base, id: 'skip', periods: { 'once@2026-10-11': { skipped: true } } }, { ...base, id: 'archive', deletedAt: '2026-10-11' }, { ...base, id: 'late', rules: [{ ...base.rules[0], startDate: '2026-10-01' }] }]
    render(<Fixture data={data} />); expect(execute).not.toHaveBeenCalled()
  })
})
