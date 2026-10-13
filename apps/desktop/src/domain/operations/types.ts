/** User-reviewed methods, never executable scripts, captured output or grants. */
export type OperationScope = 'application' | 'public_web' | 'window' | 'browser'
export interface OperationDraft {
  title: string
  goal: string
  scope: OperationScope
  applicability: string
  keywords: string[]
  preconditions: string
  steps: string[]
  completion: string
  recovery: string
}
export type OperationRunStatus = 'awaiting_review' | 'confirmed' | 'handoff' | 'error' | 'cancelled'
export interface OperationRunRecord { id: string; revision: number; at: string; status: OperationRunStatus; reason: 'review' | 'user_confirmed' | 'execution_failed' | 'interrupted' | 'needs_user'; toolCount: number }
export interface LearnedOperation extends OperationDraft {
  id: string
  revision: number
  enabled: boolean
  createdAt: string
  updatedAt: string
  runs: OperationRunRecord[]
  source?: 'automatic' | 'manual'
  pattern?: string
}
export interface OperationSelection { id: string; revision: number; parameters: Record<string, string> }
export const operationScopeLabels: Record<OperationScope, string> = { application: '程序内工具', public_web: '公开网页与接口', window: '选定窗口 / 浏览器控件', browser: '已连接浏览器 / 授权网站' }
export const emptyOperation: OperationDraft = { title: '', goal: '', scope: 'application', applicability: '', keywords: [], preconditions: '', steps: [], completion: '', recovery: '遇到登录失效、歧义、权限不足或结果不明时停下说明；不自动重试写入。' }
export const operationRunLabels = { awaiting_review: '待你核对', confirmed: '你已确认完成', handoff: '需要你处理', error: '执行未完成', cancelled: '已停止' }
