import { EyeOff } from 'lucide-react'
import type { PrivacyReviewRequest } from '../privacy'

const labels: Record<string, string> = { person: '人物', place: '地点', organization: '组织', project: '项目', account: '账号', other: '私密词', email: '邮箱', phone: '手机号', identity: '身份证', bank_card: '银行卡', ip: 'IP 地址', file_path: '本机路径' }

export function PrivacyReviewCard({ request, onDecision }: { request: PrivacyReviewRequest; onDecision: (allowed: boolean) => void }) {
  const summary = Object.entries(request.findingCounts).filter(([, count]) => count).map(([kind, count]) => `${labels[kind] ?? kind} ${count} 项`).join(' · ')
  return <section className="agent-confirmation-card privacy-review-card" role="alertdialog" aria-label="发送前保护">
    <header><span className="agent-confirmation-icon"><EyeOff size={14} /></span><span><small>发送前保护</small><strong>将使用脱敏内容连接 {request.destination}</strong></span></header>
    <div className="agent-confirmation-summary"><strong>{summary || '严格模式要求每次确认'}</strong><p>{request.sanitizedPreview || '本次请求没有正文预览。'}</p></div>
    <footer><small>原文只留在本机</small><span><button onClick={() => onDecision(false)}>取消发送</button><button className="primary-button" onClick={() => onDecision(true)}>发送脱敏内容</button></span></footer>
  </section>
}
