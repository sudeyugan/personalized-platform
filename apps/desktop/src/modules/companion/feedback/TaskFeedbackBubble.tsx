import { Check, ChevronRight, CircleAlert, LoaderCircle, X } from 'lucide-react'
import { feedbackText, type TaskFeedback } from './taskFeedback'
import './taskFeedback.css'

export function TaskFeedbackBubble({ feedback, onDetails, onDismiss }: { feedback: TaskFeedback; onDetails: () => void; onDismiss: () => void }) {
  const attention = feedback.needsConfirmation || feedback.status === 'failed'
  const active = ['running', 'preparing', 'queued'].includes(feedback.status)
  return <aside className={`task-feedback-bubble ${attention ? 'attention' : ''}`} aria-label="伙伴任务状态">
    <button className="task-feedback-detail" onClick={onDetails} title="查看任务步骤和结果">
      <span className="task-feedback-mark">{feedback.status === 'completed' ? <Check size={17} /> : attention ? <CircleAlert size={17} /> : active ? <LoaderCircle size={17} /> : <span>·</span>}</span>
      <span className="task-feedback-copy"><strong role="status">{feedbackText(feedback)}</strong><small>{feedback.completed}/{feedback.total} 步 · 查看详情</small></span><ChevronRight size={13} />
    </button>
    <button className="task-feedback-dismiss" onClick={onDismiss} title="收起提示，不停止任务" aria-label="收起任务提示"><X size={12} /></button>
  </aside>
}
