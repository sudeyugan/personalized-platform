import { emitTo } from '@tauri-apps/api/event'
import type { RefObject } from 'react'
import type { AgentTask } from '../../../domain/models'
import { AgentTaskCard } from './AgentTaskCard'

export function ChatTaskPanel({ task, expanded, detailRef, onDismiss }: {
  task?: AgentTask; expanded: boolean; detailRef: RefObject<HTMLDivElement | null>; onDismiss: () => void
}) {
  if (!task || (!expanded && ['completed', 'cancelled'].includes(task.status))) return null
  const control = (action: 'pause' | 'resume' | 'confirm' | 'cancel') => void emitTo('main', 'companion:task-control', { id: task.id, action })
  return <div ref={detailRef} tabIndex={-1} className="desktop-task-detail">
    {expanded && <div className="desktop-task-detail-heading"><span>任务详情</span><button onClick={onDismiss}>收起详情</button></div>}
    <AgentTaskCard compact expanded={expanded} task={task} onPause={() => control('pause')} onResume={() => control('resume')} onConfirm={() => control('confirm')} onCancel={() => control('cancel')} />
  </div>
}
