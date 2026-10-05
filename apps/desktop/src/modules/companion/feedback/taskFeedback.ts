import type { AgentTask } from '../../../domain/models'

export interface TaskFeedback {
  taskId: string
  status: AgentTask['status']
  completed: number
  total: number
  needsConfirmation: boolean
}
const priorities: Record<AgentTask['status'], number> = { running: 0, preparing: 1, queued: 2, paused: 3, failed: 5, completed: 5, cancelled: 5 }
export const needsTaskConfirmation = (task: AgentTask) => task.status === 'paused' && Boolean(task.steps[task.currentStep]?.confirmationRequired)

export function selectCompanionTask(tasks: AgentTask[]) {
  return tasks.map((task, index) => ({ task, index })).sort((left, right) => {
    const a = left.task, b = right.task
    const priority = (task: AgentTask) => needsTaskConfirmation(task) ? -1 : priorities[task.status]
    const difference = priority(a) - priority(b)
    if (difference) return difference
    if (a.status === 'queued' && b.status === 'queued') return a.createdAt.localeCompare(b.createdAt) || left.index - right.index
    return b.updatedAt.localeCompare(a.updatedAt) || right.index - left.index
  })[0]?.task
}

export function taskFeedback(task: AgentTask): TaskFeedback {
  return { taskId: task.id, status: task.status, completed: task.steps.filter((step) => ['completed', 'skipped'].includes(step.status)).length, total: task.steps.length, needsConfirmation: needsTaskConfirmation(task) }
}
export function feedbackText(feedback: TaskFeedback) {
  if (feedback.needsConfirmation) return '等你确认'
  return { queued: '等待开始', preparing: '正在准备', running: '正在执行', paused: '任务已暂停', completed: '已经完成', failed: '遇到问题', cancelled: '已停止' }[feedback.status]
}
export function isTaskFeedback(value: unknown): value is TaskFeedback {
  if (!value || typeof value !== 'object') return false
  const item = value as TaskFeedback
  return typeof item.taskId === 'string' && item.taskId.length <= 200 && Object.hasOwn(priorities, item.status) &&
    Number.isInteger(item.completed) && Number.isInteger(item.total) && item.total >= 0 && item.total <= 32 &&
    item.completed >= 0 && item.completed <= item.total && typeof item.needsConfirmation === 'boolean' &&
    (!item.needsConfirmation || item.status === 'paused')
}

// Advance only on meaningful state/step changes, never heartbeat timestamps.
// Do not replay old completed tasks when the app starts or returns from quiet mode.
export function createFeedbackSession() {
  let initialized = false
  let key = ''
  let expiresAt = 0
  let dismissed = false
  let current: TaskFeedback | undefined
  return {
    update(task: AgentTask | undefined, now: number, visible: boolean) {
      const nextKey = task ? [task.id, task.status, task.currentStep, needsTaskConfirmation(task), task.steps.map((step) => step.status).join(',')].join(':') : ''
      if (nextKey !== key) {
        key = nextKey
        current = task ? taskFeedback(task) : undefined
        dismissed = !visible || (!initialized && Boolean(task && ['completed', 'failed', 'cancelled'].includes(task.status)))
        expiresAt = now + 6500
      }
      initialized = true
      if (!visible) dismissed = true
      return !dismissed && current && (current.needsConfirmation || now < expiresAt) ? current : undefined
    },
    dismiss(taskId: string) { if (current?.taskId === taskId) dismissed = true },
  }
}
