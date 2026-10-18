import type { ReplyBlock } from './types'
import { object } from './safety'

// No status, provenance, URL, action or arbitrary Markdown is model-owned.
export const REPLY_PROMPT = '当本轮已经调用查询或执行工具、准备给最终回答时，只返回一个JSON对象：{"version":1,"blocks":[{"type":"paragraph","text":"直接回答用户问题"},{"type":"list","items":["必要的补充项"]}]}。最多6个块，每段最多800字、列表最多8项每项200字；需要代码时可用{"type":"code","text":"代码"}最多6000字。查询回答必须整合已返回资料：第一段先给结论，简单问题通常1至3句；复杂问题按用户目标综合比较、筛选、解释，不逐个复述工具和搜索结果。不确定就指出缺失证据，不把搜索成功当问题已解决。不要使用Markdown表格、HTML、链接、技术字段、执行状态或后续操作承诺；真实操作状态和入口由程序回执显示。普通聊天及调用工具时仍按原协议；仅改变表情的companion.set_state不算查询或执行，之后仍正常聊天。'

const forbidden = /https?:\/\/|complete\s*[=:]|(?:cookie|password|token|secret)\s*[=:]|sk-[\w-]{8,}|已(?:完成|创建|保存|打开|删除|发送|提交)|(?:我会|可以继续|要不要我)|^\s*\|.+\|\s*$|<\/?[\w:-]+[^>]*>|\*\*|\[[^\]]+\]\(/im

function exactKeys(value: Record<string, unknown>, allowed: string[]) { return Object.keys(value).every(key => allowed.includes(key)) }
function validText(value: unknown, limit: number): value is string {
  // eslint-disable-next-line no-control-regex -- Reject nonprinting controls in the model presentation envelope.
  return typeof value === 'string' && value.trim().length > 0 && value.length <= limit && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
}
export function parseModelAnswer(value: string): { blocks: ReplyBlock[]; sourceIds: string[] } | undefined {
  if (value.length > 16000) return
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch { return }
  const envelope = object(parsed)
  if (envelope.version !== 1 || !exactKeys(envelope, ['version', 'blocks', 'sourceIds']) || !Array.isArray(envelope.blocks) || envelope.blocks.length > 6) return
  if (envelope.sourceIds !== undefined && (!Array.isArray(envelope.sourceIds) || envelope.sourceIds.length > 3 || !envelope.sourceIds.every(id => typeof id === 'string' && /^s\d{1,2}$/.test(id)))) return
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
  return { blocks, sourceIds: [...new Set((envelope.sourceIds ?? []) as string[])] }
}
export function parseModelReply(value: string): ReplyBlock[] | undefined { return parseModelAnswer(value)?.blocks }
