import type { AgentTask } from '../domain/models'
import type { LibraryStore } from './libraryStoreTypes'
import { commitLibraryData, type LibraryStoreSetter } from './persistence'

type TaskActions = Pick<LibraryStore, 'addAgentTask' | 'updateAgentTask' | 'pauseAgentTask' | 'resumeAgentTask' | 'confirmAgentTaskStep' | 'cancelAgentTask' | 'clearFinishedAgentTasks'>

function activeRecordingStart(task: AgentTask) {
  let start = -1
  task.steps.forEach((step, index) => {
    if (step.status !== 'completed') return
    if (step.action === 'screen.record_start') start = index
    if (step.action === 'screen.record_stop') start = -1
  })
  return start
}

export function createAgentTaskSlice(get: () => LibraryStore, set: LibraryStoreSetter): TaskActions {
  const saveTasks = (tasks: AgentTask[]) => {
    const current = get().data
    commitLibraryData({ ...current, companion: { ...current.companion, tasks: tasks.slice(-20) } }, set)
  }
  const change = (id: string, update: (task: AgentTask) => AgentTask) => {
    const tasks = get().data.companion.tasks.map((task) => task.id === id ? update(task) : task)
    saveTasks(tasks)
  }
  return {
    addAgentTask: (task) => saveTasks([...get().data.companion.tasks, task]),
    updateAgentTask: (id, changes) => change(id, (task) => ({ ...task, ...changes, updatedAt: new Date().toISOString() })),
    pauseAgentTask: (id) => change(id, (task) => {
      if (!['queued', 'preparing', 'running'].includes(task.status)) return task
      return {
        ...task,
        status: 'paused',
        updatedAt: new Date().toISOString(),
        steps: task.steps.map((step) => step.status === 'running' ? { ...step, status: 'pending', startedAt: undefined } : step),
      }
    }),
    resumeAgentTask: (id) => change(id, (task) => {
      if (!['paused', 'failed'].includes(task.status)) return task
      const restartAt = activeRecordingStart(task)
      const steps = task.steps.map((step, index) => {
        if (step.status === 'failed' || step.status === 'running' || (restartAt >= 0 && index >= restartAt && step.action !== 'tool.call')) {
          return { ...step, status: 'pending' as const, startedAt: undefined, completedAt: undefined, error: undefined }
        }
        return step
      })
      const currentStep = steps.findIndex((step) => step.status !== 'completed' && step.status !== 'skipped')
      return { ...task, status: 'queued', steps, currentStep: currentStep < 0 ? 0 : currentStep, error: undefined, completedAt: undefined, updatedAt: new Date().toISOString() }
    }),
    confirmAgentTaskStep: (id) => change(id, (task) => {
      if (task.status !== 'paused') return task
      const step = task.steps[task.currentStep]
      if (!step?.confirmationRequired) return task
      const restartAt = activeRecordingStart(task)
      return {
        ...task,
        status: 'queued',
        currentStep: restartAt >= 0 ? restartAt : task.currentStep,
        error: undefined,
        updatedAt: new Date().toISOString(),
        steps: task.steps.map((item, index) => {
          if (index === task.currentStep) {
            return { ...item, status: 'pending' as const, confirmed: true, confirmationRequired: false, startedAt: undefined, completedAt: undefined, error: undefined }
          }
          if (restartAt >= 0 && index >= restartAt && item.action !== 'tool.call') {
            return {
              ...item, status: 'pending' as const, result: undefined, confirmed: undefined,
              confirmationRequired: undefined, startedAt: undefined, completedAt: undefined, error: undefined,
            }
          }
          return item
        }),
      }
    }),
    cancelAgentTask: (id) => change(id, (task) => {
      if (['completed', 'cancelled'].includes(task.status)) return task
      return {
        ...task,
        status: 'cancelled',
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        steps: task.steps.map((step) => step.status === 'running' ? { ...step, status: 'skipped', completedAt: new Date().toISOString() } : step),
      }
    }),
    clearFinishedAgentTasks: () => saveTasks(get().data.companion.tasks.filter((task) => !['completed', 'cancelled'].includes(task.status))),
  }
}
