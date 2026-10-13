import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { MoodEntry } from '../../../domain/models'
import { createSeedLibrary } from '../../../domain/seed'
import { useLibraryStore } from '../../../state/useLibraryStore'
import { MoodStats } from '../MoodStats'
import { moodOptions } from '../moodConfig'
import { reflectionViewKey, reflectionViews } from './ReflectionVisualizations'

const entries: MoodEntry[] = [
  { id: 'oct1', date: '2026-10-01', period: 'morning', points: { happy: 3, calm: 2 }, note: '真实备注', createdAt: '', updatedAt: '' },
  { id: 'sept15', date: '2026-09-15', period: 'morning', points: { sad: 5 }, note: '九月备注', createdAt: '', updatedAt: '' },
]
function open(entriesToUse = entries) {
  const result = render(<MoodStats entries={entriesToUse} referenceDate="2026-10-01" />)
  result.container.querySelector('details')!.open = true
  fireEvent.click(screen.getByRole('button', { name: '按周' }))
  return result
}
function chooseDetails(date: string) {
  screen.getByText('按日期查看原始记录').parentElement!.setAttribute('open', '')
  fireEvent.click(screen.getByRole('button', { name: `选择详情 ${date}` }))
}

describe('bubble matrix and ribbon reflection views', () => {
  beforeEach(() => {
    localStorage.removeItem(reflectionViewKey)
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 1, 10))
    useLibraryStore.setState({ data: createSeedLibrary(), ready: true, saveStatus: 'idle' })
  })
  afterEach(() => { localStorage.removeItem(reflectionViewKey); vi.restoreAllMocks(); vi.useRealTimers() })

  it.each(reflectionViews)('switches to $label without modifying real data', (view) => {
    const before = JSON.stringify(useLibraryStore.getState().data)
    const entryBefore = JSON.stringify(entries)
    open()
    fireEvent.click(screen.getByRole('button', { name: view.label }))
    expect(screen.getByRole('button', { name: view.label })).toHaveAttribute('aria-pressed', 'true')
    if (view.id === 'bubbles') chooseDetails('2026-10-01')
    else fireEvent.click(screen.getByRole('button', { name: '查看 2026-10-01 的心情' }))
    expect(screen.getByText('真实备注')).toBeVisible()
    expect(localStorage.getItem(reflectionViewKey)).toBe(view.id)
    expect(JSON.stringify(useLibraryStore.getState().data)).toBe(before)
    expect(JSON.stringify(entries)).toBe(entryBefore)
  })
  it('distinguishes a zero bubble from missing data and selects daily details', () => {
    open([...entries, { id: 'oct2', date: '2026-10-02', period: 'morning', points: { tired: 5 }, createdAt: '', updatedAt: '' }])
    expect(screen.getByRole('button', { name: '2026-10-02 开心：0 点；1/3 个时段' })).not.toHaveClass('mood-viz-missing')
    const missing = screen.getByRole('button', { name: '2026-09-30 开心：未记录' })
    expect(missing).toHaveClass('mood-viz-missing')
    fireEvent.click(missing)
    expect(screen.queryByText('真实备注')).not.toBeInTheDocument()
    chooseDetails('2026-10-01')
    expect(screen.getByText('真实备注')).toBeVisible()
  })
  it('keeps month, historical date and notes shared across both views', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: '按月' }))
    fireEvent.click(screen.getByRole('button', { name: '上个月' }))
    chooseDetails('2026-09-15')
    expect(screen.getByText('九月备注')).toBeVisible()
    expect(screen.getByRole('button', { name: '2026-09-15 难过：5 点；1/3 个时段' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: '色带' }))
    expect(screen.getByRole('button', { name: '查看 2026-09-15 的心情' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('九月备注')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '气泡矩阵' }))
    expect(screen.getByRole('button', { name: '2026-09-15 难过：5 点；1/3 个时段' })).toHaveAttribute('aria-pressed', 'true')
  })
  it('shows no preview controls or invented points when records are empty', () => {
    const { container } = open([])
    for (const view of reflectionViews) {
      fireEvent.click(screen.getByRole('button', { name: view.label }))
      expect(screen.getByText('这个范围内还没有心情记录。')).toBeInTheDocument()
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
      expect(screen.queryByText(/示例预览/)).not.toBeInTheDocument()
      expect(screen.queryByText(/本段记录中未出现的/)).not.toBeInTheDocument()
      expect(container.querySelectorAll('.mood-bubble-cell > i')).toHaveLength(0)
    }
  })
  it('remembers only the view and always displays real records', () => {
    const first = open()
    fireEvent.click(screen.getByRole('button', { name: '气泡矩阵' }))
    first.unmount()
    open()
    expect(screen.getByRole('button', { name: '气泡矩阵' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(localStorage.getItem(reflectionViewKey)).toBe('bubbles')
    chooseDetails('2026-10-01')
    expect(screen.getByText('真实备注')).toBeVisible()
  })
  it('still switches views when preference storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    open()
    expect(screen.getByRole('button', { name: '气泡矩阵' })).toHaveAttribute('aria-pressed', 'true')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    fireEvent.click(screen.getByRole('button', { name: '色带' }))
    expect(screen.getByRole('button', { name: '色带' })).toHaveAttribute('aria-pressed', 'true')
  })
  it('defaults to monthly bubbles with only two views and secondary daily details', () => {
    const { container } = render(<MoodStats entries={entries} referenceDate="2026-10-01" />)
    container.querySelector('details')!.open = true
    expect(screen.getByRole('button', { name: '按月' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '气泡矩阵' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(screen.getByLabelText('选择情绪可视化')).getAllByRole('button').map((button) => button.textContent)).toEqual(['气泡矩阵', '色带'])
    expect(container.querySelector('.mood-day-detail')).not.toHaveAttribute('open')
    expect(container.querySelector('.mood-viz-record-picker')).not.toHaveAttribute('open')
    fireEvent.click(screen.getByRole('button', { name: '2026-10-01 开心：3 点；1/3 个时段' }))
    expect(container.querySelector('.mood-day-detail')).toHaveAttribute('open')
    expect(screen.getByText('真实备注')).toBeVisible()
  })
  it.each(['overview', 'heatmap', 'points', 'trends', 'ring', 'columns', 'unrecognized'])('falls back from removed or invalid preference %s to bubbles', (view) => {
    localStorage.setItem(reflectionViewKey, view)
    open()
    expect(screen.getByRole('button', { name: '气泡矩阵' })).toHaveAttribute('aria-pressed', 'true')
  })
  it('keeps real rare one-point emotions and opens their actual notes', () => {
    const rareEntries: MoodEntry[] = [
      { ...entries[0], id: 'angry', date: '2026-10-05', points: { angry: 1, calm: 4 }, note: '生气的原始备注' },
      { ...entries[0], id: 'lonely', date: '2026-10-10', points: { lonely: 1, calm: 4 }, note: '孤独的原始备注' },
    ]
    const before = JSON.stringify(rareEntries)
    const { container } = open(rareEntries)
    fireEvent.click(screen.getByRole('button', { name: '按月' }))
    const rare = screen.getByRole('button', { name: '2026-10-05 生气：1 点；1/3 个时段' })
    expect(rare.querySelector('i')).not.toBeNull()
    expect(screen.getByRole('button', { name: '2026-10-10 孤独：1 点；1/3 个时段' }).querySelector('i')).not.toBeNull()
    fireEvent.click(rare)
    expect(container.querySelector('.mood-day-detail')).toHaveAttribute('open')
    expect(screen.getByText('生气的原始备注')).toBeVisible()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByText('本段记录中未出现的 9 种情绪')).toBeInTheDocument()
    expect(JSON.stringify(rareEntries)).toBe(before)
  })
  it('honors the existing ribbon preference and keeps all nonzero emotions', () => {
    localStorage.setItem(reflectionViewKey, 'original')
    const allEmotions: MoodEntry[] = moodOptions.map((mood, index) => ({ id: mood.id, date: `2026-09-${String(index + 1).padStart(2, '0')}`, period: 'morning', points: { [mood.id]: 5 }, createdAt: '', updatedAt: '' }))
    const { container } = render(<MoodStats entries={allEmotions} referenceDate="2026-09-12" />)
    container.querySelector('details')!.open = true
    expect(screen.getByRole('button', { name: '色带' })).toHaveAttribute('aria-pressed', 'true')
    expect(container.querySelectorAll('.mood-composition > div')).toHaveLength(12)
  })
})
