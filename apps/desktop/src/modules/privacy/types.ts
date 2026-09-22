import type { PrivateDictionaryCategory } from '../../domain/models'

export type PrivacyFindingKind = PrivateDictionaryCategory | 'email' | 'phone' | 'identity' | 'bank_card' | 'ip' | 'file_path' | 'secret'

export interface PrivacyFinding {
  kind: PrivacyFindingKind
  start: number
  end: number
  value: string
  severity: 'private' | 'secret'
}

export interface PrivacyReviewRequest {
  destination: string
  purpose: string
  findingCounts: Partial<Record<PrivacyFindingKind, number>>
  sanitizedPreview: string
}

export class PrivacyEgressError extends Error {
  readonly code = 'PRIVACY_EGRESS_BLOCKED'
  constructor(message = '检测到密钥、令牌或密码，已阻止内容离开本机。') { super(message) }
}
