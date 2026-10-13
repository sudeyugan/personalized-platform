import type { ReplyBlock } from './types'
import { object } from './safety'

// No status, provenance, URL, action or arbitrary Markdown is model-owned.
export const REPLY_PROMPT = '当本轮已经调用查询或执行工具、准备给最终回答时，只返回一个JSON对象：{"version":1,"blocks":[{"type":"paragraph","text":"简短说明"},{"type":"list","items":["补充项"]}]}。最多6个块，每段最多800字、列表最多8项每项200字；需要代码时可用{"type":"code","text":"代码"}最多6000字。不要使用Markdown表格、HTML、链接、技术字段、执行状态或后续操作承诺；真实状态/列表/操作入口/来源由程序回执显示。不要重复回执。普通聊天及调用工具时仍按原协议；仅改变表情的companion.set_state不算查询或执行，之后仍正常聊天。此格式只用于已调用查询或执行工具后的最终说明。'

const forbidden = /https?:\/\/|complete\s*[=:]|(?:cookie|password|token|secret)\s*[=:]|sk-[\w-]{8,}|已(?:完成|创建|保存|打开|删除|发送|提交)|(?:我会|可以继续|要不要我)|^\s*\|.+\|\s*$|<\/?[\w:-]+[^>]*>|\*\*|\[[^\]]+\]\(/im

function exactKeys(value: Record<string, unknown>, allowed: string[]) { return Object.keys(value).every(key => allowed.includes(key)) }
function validText(value: unknown, limit: number): value is string {
  // eslint-disable-next-line no-control-regex -- Reject nonprinting controls in the model presentation envelope.
  return typeof value === 'string' && value.trim().length > 0 && value.length <= limit && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
}
export function parseModelReply(value: string): ReplyBlock[] | undefined {
  if (value.length > 16000) return
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch { return }
  const envelope = object(parsed)
  if (envelope.version !== 1 || !exactKeys(envelope, ['version', 'blocks']) || !Array.isArray(envelope.blocks) || envelope.blocks.length > 6) return
  const blocks: ReplyBlock[] = []
  for (const raw of envelope.blocks) {
    const block = object(raw)
    if ((block.type === 'paragraph' || block.type === 'code') && exactKeys(block, ['type', 'text']) && validText(block.text, block.type === 'code' ? 6000 : 800)) {
      if (block.type === 'paragraph' && forbidden.test(block.text)) return
      blocks.push({ type: block.type === 'code' ? 'code' : 'text', text: block.text })
    } else if (block.type === 'list' && exactKeys(block, ['type', 'items']) && Array.isArray(block.items) && block.items.length <= 8 && block.items.every(item => validText(item, 200) && !forbidden.test(item))) {
      blocks.push({ type: 'list', items: block.items.map(title => ({ title })) })
    } else return
  }
  return blocks
}
