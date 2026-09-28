import { CirclePause, CirclePlay, CircleStop, FileVideo, ListChecks } from 'lucide-react'
import type { AgentTask } from '../../../domain/models'

interface AgentTaskCardProps {
  task: AgentTask
  compact?: boolean
  onPause?: () => void
  onResume?: () => void
  onCancel?: () => void
  onConfirm?: () => void
}

const statusLabel: Record<AgentTask['status'], string> = {
  queued: '等待开始',
  preparing: '准备旁白与资源',
  running: '正在执行',
  paused: '已暂停',
  completed: '已完成',
  failed: '需要处理',
  cancelled: '已停止',
}

export function AgentTaskCard({ task, compact = false, onPause, onResume, onConfirm, onCancel }: AgentTaskCardProps) {
  const completed = task.steps.filter((step) => step.status === 'completed' || step.status === 'skipped').length
  const current = task.steps[task.currentStep]
  const progress = task.steps.length ? Math.round(completed / task.steps.length * 100) : 0
  const active = ['queued', 'preparing', 'running'].includes(task.status)
  const needsConfirmation = task.status === 'paused' && Boolean(current?.confirmationRequired)
  const resumable = (task.status === 'paused' || task.status === 'failed') && !needsConfirmation
  return <section className={`agent-task-card ${compact ? 'compact' : ''} status-${task.status}`}>
    <header>
      <span className="agent-task-icon"><ListChecks size={14} /></span>
      <span><small>{statusLabel[task.status]}</small><strong>{task.title}</strong></span>
      <b>{completed}/{task.steps.length}</b>
    </header>
    <progress max={100} value={progress} />
    <p>{task.error || current?.title || task.goal}</p>
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
