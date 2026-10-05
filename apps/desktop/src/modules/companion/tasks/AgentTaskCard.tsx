import { CirclePause, CirclePlay, CircleStop, FileVideo, ListChecks } from 'lucide-react'
import type { AgentTask } from '../../../domain/models'

interface AgentTaskCardProps {
  task: AgentTask
  compact?: boolean
  expanded?: boolean
  onPause?: () => void
  onResume?: () => void
  onCancel?: () => void
  onConfirm?: () => void
}

const statusLabel: Record<AgentTask['status'], string> = {
  queued: '等待开始',
  preparing: '正在准备',
  running: '正在执行',
  paused: '已暂停',
  completed: '已完成',
  failed: '需要处理',
  cancelled: '已停止',
}

export function AgentTaskCard({ task, compact = false, expanded = false, onPause, onResume, onConfirm, onCancel }: AgentTaskCardProps) {
  const completed = task.steps.filter((step) => step.status === 'completed' || step.status === 'skipped').length
  const current = task.steps[task.currentStep]
  const progress = task.steps.length ? Math.round(completed / task.steps.length * 100) : 0
  const active = ['queued', 'preparing', 'running'].includes(task.status)
  const needsConfirmation = task.status === 'paused' && Boolean(current?.confirmationRequired)
  const resumable = (task.status === 'paused' || task.status === 'failed') && !needsConfirmation
  return <section className={`agent-task-card ${compact ? 'compact' : ''} status-${task.status}`}>
    <header>
      <span className="agent-task-icon"><ListChecks size={14} /></span>
      <span><small>{needsConfirmation ? '等你确认' : statusLabel[task.status]}</small><strong>{task.title}</strong></span>
      <b>{completed}/{task.steps.length}</b>
    </header>
    <progress max={100} value={progress} />
    <p>{task.error || current?.title || task.goal}</p>
    {expanded && <ol className="agent-task-steps" aria-label="任务步骤">{task.steps.map((step, index) => <li key={step.id}>
      <b>{index + 1}</b><span>{step.title}</span><small>{({ pending: '待执行', running: '执行中', completed: '完成', failed: '失败', skipped: '跳过' })[step.status]}</small>
    </li>)}</ol>}
    {task.artifacts.map((artifact) => <div className="agent-task-artifact" key={artifact.id}>
      <FileVideo size={12} /><span><strong>{artifact.label}</strong><small title={artifact.path}>{artifact.path}</small></span>
    </div>)}
    {(active || resumable || needsConfirmation) && <footer>
      {active && onPause && <button onClick={onPause}><CirclePause size={13} />暂停</button>}
      {needsConfirmation && onConfirm && <button className="primary-button" onClick={onConfirm}><CirclePlay size={13} />允许此步并继续</button>}
      {resumable && onResume && <button className="primary-button" onClick={onResume}><CirclePlay size={13} />继续</button>}
      {onCancel && <button onClick={onCancel}><CircleStop size={13} />停止</button>}
    </footer>}
  </section>
}
