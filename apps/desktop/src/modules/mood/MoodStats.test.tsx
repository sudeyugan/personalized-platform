import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { MoodEntry } from '../../domain/models'
import { createSeedLibrary } from '../../domain/seed'
import { useLibraryStore } from '../../state/useLibraryStore'
import { MoodStats } from './MoodStats'

const entries: MoodEntry[] = [
  { id: 'old', date: '2024-02-29', period: 'evening', points: { calm: 5 }, note: '闰年旧记录', createdAt: '2024-02-29T12:00:00Z', updatedAt: '2024-02-29T12:00:00Z' },
  { id: 'last-month', date: '2026-09-15', period: 'morning', points: { happy: 5 }, note: '上个月的心情', createdAt: '2026-09-15T00:00:00Z', updatedAt: '2026-09-15T00:00:00Z' },
  { id: 'today', date: '2026-10-01', period: 'morning', points: { calm: 5 }, note: '今天的心情', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' },
]

function openReflection() {
  const result = render(<MoodStats entries={entries} referenceDate="2026-10-01" />)
  result.container.querySelector('details')!.open = true
  return result
}

describe('historical mood reflection', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 1, 10))
    useLibraryStore.setState({ data: createSeedLibrary(), ready: true, saveStatus: 'idle' })
  })
  afterEach(() => vi.useRealTimers())

  it('opens last month with its daily notes and returns to the current month', () => {
    openReflection()
    fireEvent.click(screen.getByRole('button', { name: '按月' }))
    expect(screen.getByText('已记录 1 / 1 个可记录时段')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下个月' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '上个月' }))
    expect(screen.getByLabelText('选择回望月份')).toHaveValue('2026-09')
    expect(screen.getByText('已记录 1 / 90 个可记录时段')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '查看 2026-09-15 的心情' }))
    expect(screen.getByText('上个月的心情')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '所选月汇总' }))
    expect(screen.getByText('已记录 1 次')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '回到本月' }))
    expect(screen.getByLabelText('选择回望月份')).toHaveValue('2026-10')
    expect(screen.getByText('今天的心情')).toBeInTheDocument()
  })

  it('jumps to older years, preserves leap-day records and navigates empty months', () => {
    openReflection()
    fireEvent.click(screen.getByRole('button', { name: '按月' }))
    fireEvent.change(screen.getByLabelText('选择回望月份'), { target: { value: '2024-02' } })
    fireEvent.click(screen.getByRole('button', { name: '查看 2024-02-29 的心情' }))
    expect(screen.getByText('闰年旧记录')).toBeInTheDocument()
    expect(screen.getByText('已记录 1 / 87 个可记录时段')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '上个月' }))
    expect(screen.getByText('这个范围内还没有心情记录。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '下个月' }))
    expect(screen.getByLabelText('选择回望月份')).toHaveValue('2024-02')
    fireEvent.change(screen.getByLabelText('选择回望月份'), { target: { value: '2026-11' } })
    expect(screen.getByLabelText('选择回望月份')).toHaveValue('2024-02')
  })

  it('browses previous weeks and returns without changing the stored entries', () => {
    const before = JSON.stringify(entries)
    openReflection()
    fireEvent.click(screen.getByRole('button', { name: '上一周' }))
    expect(screen.getByText('2026/09/21 — 2026/09/27')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '上一周' }))
    fireEvent.click(screen.getByRole('button', { name: '查看 2026-09-15 的心情' }))
    expect(screen.getByText('上个月的心情')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '回到本周' }))
    expect(screen.getByText('今天的心情')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下一周' })).toBeDisabled()
    expect(JSON.stringify(entries)).toBe(before)
  })

  it('honors agent navigation to a historical reflection', () => {
    const data = createSeedLibrary()
    data.session.agentNavigation = { id: 'history', destination: 'mood.reflection', date: '2024-02-29', range: 'month' }
    useLibraryStore.setState({ data })
    const { container } = render(<MoodStats entries={entries} referenceDate="2026-10-01" />)
    expect(container.querySelector('details')).toHaveAttribute('open')
    expect(screen.getByLabelText('选择回望月份')).toHaveValue('2024-02')
    expect(screen.getByText('闰年旧记录')).toBeInTheDocument()
  })
})
