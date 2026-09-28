import { describe, expect, it } from 'vitest'
import { createAgentTaskFromDraft } from './taskPlan'

describe('agent task plans', () => {
  it('creates a persistent executable plan', () => {
    const task = createAgentTaskFromDraft({
      title: '介绍一隅',
      goal: '录制一段自我介绍',
      steps: [
        { title: '开始录屏', action: 'screen.record_start', fps: 30 },
        { title: '打开首页', action: 'app.open', destination: 'home' },
        { title: '讲解首页', action: 'speech.say', text: '这里是今日工作台。' },
        { title: '停止录屏', action: 'screen.record_stop' },
      ],
    }, new Date('2026-09-28T08:00:00.000Z'))
    expect(task.status).toBe('queued')
    expect(task.steps).toHaveLength(4)
    expect(task.steps[0]).toMatchObject({ action: 'screen.record_start', source: 'desktop', fps: 30, status: 'pending' })
  })

  it('rejects unsupported destinations and unclosed recordings', () => {
    expect(() => createAgentTaskFromDraft({
      title: '错误页面',
      goal: '测试',
      steps: [{ title: '打开未知页面', action: 'app.open', destination: 'unknown' }],
    })).toThrow('受支持的页面目标')
    expect(() => createAgentTaskFromDraft({
      title: '没有结束',
      goal: '测试',
      steps: [{ title: '开始录屏', action: 'screen.record_start' }],
    })).toThrow('停止录屏')
  })

  it('bounds waits and plan size', () => {
    const task = createAgentTaskFromDraft({
      title: '等待',
      goal: '测试等待',
      steps: [{ title: '稍等', action: 'wait', durationMs: 999_999 }],
    })
    expect(task.steps[0].durationMs).toBe(60_000)
    expect(() => createAgentTaskFromDraft({
      title: '太长',
      goal: '测试',
      steps: Array.from({ length: 33 }, (_, index) => ({ title: String(index), action: 'wait' as const })),
    })).toThrow('1–32')
  })
})
