import type { CompanionMessage } from '../../domain/models'

/** Compatibility only: recognize obsolete fixed receipts without hiding ordinary chat. */
export function isLegacyBrowserSummary(message: CompanionMessage): boolean {
  return message.localOnly === true && message.id.startsWith('summary-transient-') && (
    message.content === '已授权浏览器查询（隐私摘要）' ||
    message.content === '本次查询回合已结束。私人网页内容未保存，重新查询可查看最新结果。')
}
