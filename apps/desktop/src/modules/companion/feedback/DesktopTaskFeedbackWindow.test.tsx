import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DesktopTaskFeedbackWindow } from './DesktopTaskFeedbackWindow'

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), channels: [] as { onmessage: (value: unknown) => void }[] }))
vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
  Channel: class {
    onmessage = (_value: unknown) => undefined
    constructor() { mocks.channels.push(this) }
  },
}))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); mocks.invoke.mockReset(); mocks.channels.length = 0 })

it('renders only channel state and sends fixed detail/dismiss requests', async () => {
  vi.stubGlobal('__TAURI_INTERNALS__', {})
  mocks.invoke.mockResolvedValue(12)
  const { getByRole } = render(<DesktopTaskFeedbackWindow />)
  await act(async () => { await Promise.resolve(); mocks.channels[0].onmessage({ taskId: 't', status: 'completed', completed: 2, total: 2, needsConfirmation: false }) })
  expect(getByRole('status')).toHaveTextContent('已经完成')
  fireEvent.click(getByRole('button', { name: /已经完成/ }))
  expect(mocks.invoke).toHaveBeenCalledWith('companion_feedback_request', { request: { kind: 'details', taskId: 't' } })
  fireEvent.click(getByRole('button', { name: '收起任务提示' }))
  expect(mocks.invoke).toHaveBeenCalledWith('companion_feedback_request', { request: { kind: 'dismiss', taskId: 't' } })
})
it('releases late subscription by its own ID and ignores post-unmount channel data', async () => {
  vi.stubGlobal('__TAURI_INTERNALS__', {})
  let resolve!: (id: number) => void
  mocks.invoke.mockReturnValueOnce(new Promise<number>(done => { resolve = done })).mockResolvedValue(undefined)
  const { unmount } = render(<DesktopTaskFeedbackWindow />)
  unmount()
  await act(async () => { resolve(18); await Promise.resolve() })
  expect(mocks.invoke).toHaveBeenCalledWith('companion_feedback_unsubscribe', { subscriptionId: 18 })
  expect(() => mocks.channels[0].onmessage({ status: 'completed' })).not.toThrow()
})
