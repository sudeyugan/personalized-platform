import { ShieldCheck } from 'lucide-react'
import { describeAgentPermission } from './agent/permissionCopy'
import type { AgentPermissionRequest } from './agent/types'

interface AgentPermissionCardProps {
  request: AgentPermissionRequest
  onDecision: (allowed: boolean) => void
}

export function AgentPermissionCard({ request, onDecision }: AgentPermissionCardProps) {
  const copy = describeAgentPermission(request)
  return <section className="agent-confirmation-card" role="alertdialog" aria-label={copy.title}>
    <header>
      <span className="agent-confirmation-icon"><ShieldCheck size={14} /></span>
      <span><small>需要你的确认</small><strong>{copy.title}</strong></span>
    </header>
    <div className="agent-confirmation-summary">
      <strong>{copy.subject || request.tool.description}</strong>
      {copy.detail && <p>{copy.detail}</p>}
    </div>
    <footer>
      <small>仅允许这一次</small>
      <span><button onClick={() => onDecision(false)}>暂不执行</button><button className="primary-button" onClick={() => onDecision(true)}>允许这次</button></span>
    </footer>
  </section>
}
