import { describe, expect, it } from 'vitest'
import type { AgentTask } from '../../../domain/models'
import { createFeedbackSession, feedbackText, isTaskFeedback, selectCompanionTask, taskFeedback } from './taskFeedback'
import { feedbackPlacement } from './feedbackPlacement'

export const taskFixture = (status: AgentTask['status'] = 'running', id = 't1'): AgentTask => ({
  id, status, title: '私密标题', goal: '正文不能进入气泡', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-04T00:00:00Z', currentStep: 0, artifacts: [],
  steps: [{ id: 's1', title: '操作', action: 'wait', status: 'pending', failurePolicy: 'ask', durationMs: 1000 }],
})
describe('task feedback rules', () => {
  it('prioritizes confirmation and active execution over newer completed tasks', () => {
    const active = taskFixture()
    const done = { ...taskFixture('completed', 'done'), updatedAt: '2026-10-05T00:00:00Z' }
    expect(selectCompanionTask([active, done])).toBe(active)
    const confirmation = taskFixture('paused', 'confirm')
    confirmation.steps[0].confirmationRequired = true
    expect(selectCompanionTask([done, active, confirmation])).toBe(confirmation)
  })
  it('lets a fresh completion replace old failures, including same-millisecond updates', () => {
    const failed = taskFixture('failed', 'old')
    const done = taskFixture('completed', 'new')
    expect(selectCompanionTask([failed, done])).toBe(done)
  })
  it('sends only minimal non-private state with truthful labels', () => {
    const task = taskFixture('failed')
    task.error = 'D:/private/failed'
    task.steps[0].arguments = { text: 'private' }
    const result = taskFeedback(task)
    expect(Object.keys(result).sort()).toEqual(['completed', 'needsConfirmation', 'status', 'taskId', 'total'])
    expect(JSON.stringify(result)).not.toMatch(/私密|正文|private|arguments/)
    expect(feedbackText(result)).toBe('遇到问题')
    expect(feedbackText(taskFeedback(taskFixture('completed')))).toBe('已经完成')
    expect(isTaskFeedback(result)).toBe(true)
    expect(isTaskFeedback({ ...result, status: '__proto__' })).toBe(false)
    expect(isTaskFeedback({ ...result, completed: 3 })).toBe(false)
  })
  it('expires progress without refreshing on timestamps and shows completion transitions', () => {
    const session = createFeedbackSession()
    const task = taskFixture()
    expect(session.update(task, 100, true)).toBeDefined()
    expect(session.update({ ...task, updatedAt: 'new' }, 6601, true)).toBeUndefined()
    expect(session.update({ ...task, status: 'completed' }, 6700, true)?.status).toBe('completed')
    expect(session.update({ ...task, status: 'completed' }, 13201, true)).toBeUndefined()
  })
  it('holds confirmation until dismissed but refreshes on a real next state', () => {
    const session = createFeedbackSession()
    const task = taskFixture('paused')
    task.steps[0].confirmationRequired = true
    expect(session.update(task, 0, true)?.needsConfirmation).toBe(true)
    expect(session.update(task, 100_000, true)).toBeDefined()
    session.dismiss(task.id)
    expect(session.update(task, 100_001, true)).toBeUndefined()
    expect(session.update({ ...task, status: 'running' }, 100_002, true)).toBeDefined()
  })
  it('does not replay history or quiet/hidden changes', () => {
    expect(createFeedbackSession().update(taskFixture('completed'), 0, true)).toBeUndefined()
    const session = createFeedbackSession()
    const task = taskFixture()
    session.update(task, 0, false)
    expect(session.update(task, 100, true)).toBeUndefined()
    task.status = 'completed'
    session.update(task, 200, false)
    expect(session.update(task, 300, true)).toBeUndefined()
    expect(createFeedbackSession().update(taskFixture('paused'), 0, true)).toBeDefined()
  })
  it('keeps bubbles inside negative-coordinate and bottom work areas', () => {
    const area = { x: -1920, y: 0, width: 1920, height: 1040 }
    const left = feedbackPlacement({ x: -1920, y: 950, width: 192, height: 240 }, area, { width: 244, height: 64 }, 8)
    expect(left.x).toBe(-1720)
    expect(left.y + 64).toBeLessThanOrEqual(1040)
    const right = feedbackPlacement({ x: -192, y: 200, width: 192, height: 240 }, area, { width: 244, height: 64 }, 8)
    expect(right.x).toBe(-444)
    const narrow = feedbackPlacement({ x: 10, y: 10, width: 192, height: 240 }, { x: 0, y: 0, width: 300, height: 400 }, { width: 244, height: 64 }, 8)
    expect(narrow.x).toBeGreaterThanOrEqual(0)
    expect(narrow.x + 244).toBeLessThanOrEqual(300)
    expect(narrow.y).toBeGreaterThanOrEqual(0)
  })
})
