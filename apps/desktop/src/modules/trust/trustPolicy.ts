import type { LibraryData } from '../../domain/models'
import type { AgentContextSnapshot, AgentMessage } from '../companion/agent/types'

export type ExternalAiPurpose = 'companion' | 'daily_question' | 'image_generation' | 'voice'

export class TrustPolicyError extends Error {
  readonly code = 'EXTERNAL_AI_BLOCKED'
  constructor(purpose: ExternalAiPurpose) {
    const labels: Record<ExternalAiPurpose, string> = { companion: 'AI 伙伴对话', daily_question: '朝问生成', image_generation: '图像生成', voice: '语音服务' }
    super(`隐私设置已阻止${labels[purpose]}连接外部服务；可在“设置 → 隐私与安全”中开启外部 AI 处理。`)
  }
}

export function assertExternalAiAllowed(providerId: string, trust: LibraryData['settings']['trust'], purpose: ExternalAiPurpose) {
  if (providerId !== 'mock' && providerId !== 'none' && !trust.externalAiProcessing) throw new TrustPolicyError(purpose)
}

export function applyContextPrivacy(context: AgentContextSnapshot, trust: LibraryData['settings']['trust']): AgentContextSnapshot {
  if (trust.shareAuthorizedContext) return context
  return { page: context.page, companion: context.companion, localTime: context.localTime }
}

export function applyHistoryPrivacy(history: AgentMessage[], trust: LibraryData['settings']['trust']) {
  return trust.shareRecentConversation ? history : []
}

export const trustBoundarySummary = [
  { id: 'secrets', title: '密钥留在 Windows', detail: 'API Key 由当前用户 DPAPI 保护，不进入资料库、Prompt 或备份。' },
  { id: 'agent', title: '模型不能直达数据', detail: '读取和写入只经过声明过的 Tool；写入仍需逐次确认。' },
  { id: 'windows', title: '窗口能力隔离', detail: '桌面形象与聊天子窗口没有资料库命令权限。' },
  { id: 'audit', title: '审计默认脱敏', detail: '只记录 Tool、参数形状、结论与耗时，不记录正文和结果内容。' },
] as const
