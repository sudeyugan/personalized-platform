import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConfigHandoff } from '@yiyu/sync'
import { ConfigHandoffPanel } from './ConfigHandoffPanel'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function fixture() {
  const tick = vi.fn(async (): Promise<[]> => [])
  const client = {
    tick,
    status: async () => ({ incoming: undefined, code: '', approvals: 0 }),
    sending: async () => [],
  } as unknown as ConfigHandoff
  return { client, tick }
}

describe('configuration handoff status', () => {
  it('shows the actual verification failure instead of claiming the hub needs updating', async () => {
    vi.useFakeTimers()
    const { client, tick } = fixture()
    tick.mockRejectedValueOnce(new Error('配置交接校验失败；没有应用设置。'))
    await act(async () => { render(<ConfigHandoffPanel client={client}/>) })
    expect(screen.getByText('配置交接校验失败；没有应用设置。')).toBeInTheDocument()
    expect(screen.queryByText(/确认中枢也已更新/)).not.toBeInTheDocument()
    await act(async () => { await vi.advanceTimersByTimeAsync(15000) })
    expect(screen.queryByText('配置交接校验失败；没有应用设置。')).not.toBeInTheDocument()
  })

  it('does not render unknown error objects or blame a server version', async () => {
    const { client, tick } = fixture()
    tick.mockRejectedValueOnce({ detail: 'fixture-not-for-display' })
    await act(async () => { render(<ConfigHandoffPanel client={client}/>) })
    expect(screen.getByText('配置交接暂不可用；现有配置保留。请稍后重试。')).toBeInTheDocument()
    expect(screen.queryByText(/fixture-not-for-display/)).not.toBeInTheDocument()
  })
})
