import type { ReplyDocument, ToolReceipt, ReplyState } from './types'
import { replyStateLabels } from './types'
import { formatReply, formatBlocks } from './format'
import { parseModelReply } from './modelReply'
import { toolPresentation, visibleReceipt } from './toolPresentation'
import { inlineText } from './safety'
import { publicReadTools } from '../agent/publicReadTools'

// Formatting is separate from tool scheduling: collecting a receipt never ends
// an execution. Only the runtime's existing completion paths call finish().
export class ReplySession {
  private readonly receipts: ToolReceipt[] = []
  accept(receipt: ToolReceipt) { if (visibleReceipt(receipt) && this.receipts.length < 12) this.receipts.push(receipt) }
  get hasTools() { return this.receipts.length > 0 }
  finish(modelText?: string, localText?: string) {
    if (!this.hasTools) return localText ?? modelText ?? ''
    const verified=this.receipts.some(receipt=>receipt.call.name==='browser.verify'&&receipt.result.success)
    const pageAttempted = this.receipts.some(receipt => ['browser.read_page','browser.observe','browser.followed_live'].includes(receipt.call.name))
    const displayed = this.receipts.filter(receipt => !(receipt.result.success && (verified&&receipt.call.name.startsWith('browser.')&&receipt.call.name!=='browser.verify'||pageAttempted&&['browser.status','browser.tabs','browser.ensure_page'].includes(receipt.call.name))))
    const documents = displayed.map(toolPresentation)
    const state = aggregateState(documents)
    const explanation = modelText && this.receipts.every(receipt => receipt.definition?.capability === 'read' || receipt.definition?.risk === 'read_only' || ['browser.read_page','browser.ensure_page','browser.act'].includes(receipt.call.name) && receipt.definition?.risk === 'low' || publicReadTools.has(receipt.call.name) || receipt.call.name === 'web.search') ? parseModelReply(modelText) : undefined
    const parts = documents.length === 1 ? [formatReply(documents[0])] : [
      `## ${replyStateLabels[state]} · 本次执行结果`,
      ...documents.map((document, index) => [
        `### ${index + 1}. ${replyStateLabels[document.state]} · ${inlineText(document.title)}`,
        ...formatBlocks(document.blocks), ...document.notes.map(note => formatBlocks([{type:'text',text:note}])[0]).map(note => `> ${note}`),
      ].join('\n\n')),
    ]
    // Local flow messages may contain disambiguation or safety context that
    // cannot be inferred from the final tool's success flag. Keep that context.
    const localAlreadyShown = documents.some(document => document.blocks.some(block => block.type === 'text' && block.text === localText))
    if (localText && !localAlreadyShown && !['browser.followed_live','fortune.draw','truth.draw','answer_book.draw','task.create','operation.prepare','operation.propose'].includes(this.receipts.at(-1)!.call.name)) parts.push(...formatBlocks([{type:'text',text:localText.replace(/https?:\/\/[^\s。]+/g,'对应来源链接')}]))
    if (explanation?.length) parts.push('### 分析说明', ...formatBlocks(explanation))
    return parts.join('\n\n')
  }
  stopped(reason: string) {
    return [`## 部分结果 · 本轮已停止`, this.finish(), ...formatBlocks([{type:'text',text:reason}]), '> 之前已执行的步骤可能已生效，不会自动撤销。'].join('\n\n')
  }
}
function aggregateState(documents: ReplyDocument[]): ReplyState {
  const states = documents.map(document => document.state)
  if (states.every(state => state === 'cancelled')) return 'cancelled'
  if (states.every(state => state === 'failed' || state === 'cancelled')) return 'failed'
  if (states.some(state => ['failed','cancelled','partial','unknown'].includes(state))) return documents.length === 1 ? states[0] : 'partial'
  if (states.includes('pending')) return 'pending'
  if (states.every(state => state === 'empty')) return 'empty'
  return 'completed'
}
