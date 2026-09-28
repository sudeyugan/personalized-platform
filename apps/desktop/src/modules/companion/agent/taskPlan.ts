import type { AgentTask, AgentTaskAction, AgentTaskFailurePolicy } from '../../../domain/models'
import { agentDestinations } from './featureContract'

export interface AgentTaskStepDraft {
  title: string
  action: AgentTaskAction
  failurePolicy?: AgentTaskFailurePolicy
  destination?: string
  text?: string
  durationMs?: number
  source?: string
}

export interface AgentTaskDraft {
  title: string
  goal: string
  steps: AgentTaskStepDraft[]
}

const actions = new Set<AgentTaskAction>(['app.open', 'speech.say', 'wait', 'screen.record_start', 'screen.record_stop'])
const failurePolicies = new Set<AgentTaskFailurePolicy>(['retry', 'replan', 'ask', 'stop'])

function requiredText(value: unknown, label: string, maximum: number) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}不能为空`)
  const clean = value.trim()
  if (clean.length > maximum) throw new Error(`${label}不能超过 ${maximum} 个字符`)
  return clean
}

export function createAgentTaskFromDraft(input: AgentTaskDraft, now = new Date()): AgentTask {
  const title = requiredText(input.title, '任务标题', 80)
  const goal = requiredText(input.goal, '任务目标', 500)
  if (!Array.isArray(input.steps) || input.steps.length < 1 || input.steps.length > 32) throw new Error('任务计划需要 1–32 个步骤')
  let recording = false
  const steps = input.steps.map((draft, index) => {
    if (!actions.has(draft.action)) throw new Error(`第 ${index + 1} 步使用了不支持的动作`)
    const step = {
      id: `task-step-${crypto.randomUUID()}`,
      title: requiredText(draft.title, `第 ${index + 1} 步标题`, 100),
      action: draft.action,
      status: 'pending' as const,
      failurePolicy: failurePolicies.has(draft.failurePolicy ?? 'stop') ? draft.failurePolicy ?? 'stop' : 'stop',
      destination: draft.destination?.trim() || undefined,
      text: draft.text?.trim() || undefined,
      durationMs: draft.durationMs,
      source: draft.source?.trim() || undefined,
    }
    if (step.action === 'app.open' && (!step.destination || !agentDestinations.includes(step.destination))) throw new Error(`第 ${index + 1} 步缺少受支持的页面目标`)
    if (step.action === 'speech.say' && !step.text) throw new Error(`第 ${index + 1} 步缺少旁白文字`)
    if (step.text && step.text.length > 1200) throw new Error(`第 ${index + 1} 步旁白不能超过 1200 个字符`)
    if (step.action === 'wait') step.durationMs = Math.max(250, Math.min(60_000, Math.round(step.durationMs ?? 1000)))
    if (step.action === 'screen.record_start') {
      if (recording) throw new Error('同一任务不能重复开始录屏')
      recording = true
      step.source = step.source || 'desktop'
    }
    if (step.action === 'screen.record_stop') {
      if (!recording) throw new Error('停止录屏之前必须先开始录屏')
      recording = false
    }
    return step
  })
  if (recording) throw new Error('录屏任务必须包含停止录屏步骤')
  const timestamp = now.toISOString()
  return {
    id: `agent-task-${crypto.randomUUID()}`,
    title,
    goal,
    status: 'queued',
    steps,
    currentStep: 0,
    artifacts: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}
