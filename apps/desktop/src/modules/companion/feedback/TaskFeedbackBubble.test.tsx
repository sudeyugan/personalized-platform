import { fireEvent, render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { TaskFeedbackBubble } from './TaskFeedbackBubble'
import { AgentTaskCard } from '../tasks/AgentTaskCard'
import type { AgentTask } from '../../../domain/models'

it('shows confirmation and separate view/dismiss controls without approving a step', () => {
  const detail = vi.fn(), dismiss = vi.fn()
  const { getByRole } = render(<TaskFeedbackBubble feedback={{ taskId: 't', status: 'paused', needsConfirmation: true, completed: 1, total: 2 }} onDetails={detail} onDismiss={dismiss} />)
  expect(getByRole('status')).toHaveTextContent('等你确认')
  fireEvent.click(getByRole('button', { name: /等你确认/ }))
  expect(detail).toHaveBeenCalledOnce()
  expect(dismiss).not.toHaveBeenCalled()
  fireEvent.click(getByRole('button', { name: '收起任务提示' }))
  expect(dismiss).toHaveBeenCalledOnce()
})
it('expands real steps while preserving the existing explicit confirmation button', () => {
  const task: AgentTask = { id: 't', title: '演示', goal: '演示', status: 'paused', currentStep: 1, createdAt: '', updatedAt: '', artifacts: [], steps: [
    { id: 's1', title: '首页', action: 'app.open', destination: 'home', status: 'completed', failurePolicy: 'stop' },
    { id: 's2', title: '写入日记', action: 'tool.call', toolName: 'diary.create', status: 'pending', failurePolicy: 'ask', confirmationRequired: true },
  ] }
  const confirm = vi.fn()
  const { getByRole, getByText } = render(<AgentTaskCard compact expanded task={task} onConfirm={confirm} />)
  expect(getByRole('list', { name: '任务步骤' })).toHaveTextContent('首页')
  expect(getByText('等你确认')).toBeInTheDocument()
  expect(confirm).not.toHaveBeenCalled()
  fireEvent.click(getByRole('button', { name: '允许此步并继续' }))
  expect(confirm).toHaveBeenCalledOnce()
})
