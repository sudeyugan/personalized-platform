import { describe, expect, it, vi } from 'vitest'
import type { AgentTask } from '../domain/models'
import { createSeedLibrary } from '../domain/seed'
import { createAgentTaskSlice } from './agentTaskSlice'
import type { LibraryStore } from './libraryStoreTypes'
import type { LibraryStoreSetter } from './persistence'

vi.mock('../infrastructure/libraryRepository', () => ({
  libraryRepository: { save: vi.fn().mockResolvedValue(undefined) },
}))

function task(): AgentTask {
  const timestamp = '2026-09-28T08:00:00.000Z'
  return {
    id: 'task-recording-confirm',
    title: '录屏与写入',
    goal: '确认恢复不重复写入',
    status: 'paused',
    currentStep: 3,
    artifacts: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    steps: [
      { id: 'record', title: '开始录屏', action: 'screen.record_start', status: 'completed', failurePolicy: 'stop', completedAt: timestamp },
      { id: 'created', title: '创建待办', action: 'tool.call', toolName: 'todo.create', arguments: { title: '一次' }, result: { id: 'todo-1' }, status: 'completed', failurePolicy: 'ask', completedAt: timestamp },
      { id: 'speech', title: '讲解', action: 'speech.say', text: '已经创建。', status: 'completed', failurePolicy: 'stop', completedAt: timestamp },
      { id: 'confirm', title: '修改待办', action: 'tool.call', toolName: 'todo.update', arguments: { id: 'todo-1' }, status: 'pending', failurePolicy: 'ask', confirmationRequired: true },
      { id: 'stop', title: '停止录屏', action: 'screen.record_stop', status: 'pending', failurePolicy: 'stop' },
    ],
  }
}

describe('agent task state', () => {
  it('restarts recording steps without replaying completed tool calls after confirmation', () => {
    const data = createSeedLibrary()
    data.companion.tasks = [task()]
    let state = { data, saveStatus: 'idle' } as LibraryStore
    const set: LibraryStoreSetter = (partial) => {
      const changes = typeof partial === 'function' ? partial(state) : partial
      state = { ...state, ...changes }
    }
    const actions = createAgentTaskSlice(() => state, set)
    state = { ...state, ...actions }

    actions.confirmAgentTaskStep('task-recording-confirm')

    const updated = state.data.companion.tasks[0]
    expect(updated).toMatchObject({ status: 'queued', currentStep: 0 })
    expect(updated.steps[0]).toMatchObject({ status: 'pending' })
    expect(updated.steps[1]).toMatchObject({ status: 'completed', result: { id: 'todo-1' } })
    expect(updated.steps[2]).toMatchObject({ status: 'pending' })
    expect(updated.steps[3]).toMatchObject({ status: 'pending', confirmed: true, confirmationRequired: false })
    expect(updated.steps[4]).toMatchObject({ status: 'pending' })
  })
})
