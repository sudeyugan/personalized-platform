import { useState } from 'react'
import type { LearnedOperation, OperationSelection } from '../../domain/operations/types'
import { operationParameters, resolveOperation, methodInstruction } from '../../domain/operations/method'
import { operationScopeLabels, operationRunLabels } from '../../domain/operations/types'
import { takeoverRequestEvent } from '../computer-takeover/types'
import { PrivacyReviewCard } from '../companion/PrivacyReviewCard'
import { describeAgentPermission } from '../companion/agent/permissionCopy'
import { useOperationRun } from './useOperationRun'

export function OperationRunner({ item, onBack, onWindowReady }: { item: LearnedOperation; onBack(): void; onWindowReady(): void }) {
  const [parameters, setParameters] = useState<Record<string, string>>({})
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const selection: OperationSelection = { id: item.id, revision: item.revision, parameters }
  const execution = useOperationRun(selection)
  let preview: string | undefined
  try { preview = methodInstruction(resolveOperation(item, selection)) } catch { /* all parameters required before execution */ }
  const start = () => {
    try {
      if (!consent) throw new Error('请核对范围和本次外发')
      resolveOperation(item, selection)
      if (item.scope === 'window') {
        window.dispatchEvent(new CustomEvent(takeoverRequestEvent, { detail: { operation: selection } }))
        onWindowReady()
      } else void execution.start()
    } catch (reason) { setError(String(reason)) }
  }
  const copy = execution.permission ? describeAgentPermission(execution.permission) : undefined
  return <div className="operation-runner">
    <small>{operationScopeLabels[item.scope]} · 第{item.revision}版</small><h3>{item.title}</h3><p>{item.applicability}</p>
    {operationParameters(item).map(name => <label key={name}>本次{name}<input disabled={execution.busy} required maxLength={500} value={parameters[name] ?? ''} onChange={event => { setParameters(old => ({ ...old, [name]: event.target.value })); setConsent(false) }} /></label>)}
    <details><summary>本次方法预览</summary><pre>{preview ?? '请先填写全部参数。'}</pre></details>
    <label className="operation-consent"><input disabled={execution.busy} type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />同意本次方法与参数由已配置的对话模型处理；私人读取仍按现有权限，写入/公开目标仍按规则确认。结果不保存到聊天或方法库。</label>
    <p className="operation-note">{item.scope === 'window' ? '下一步选择具体窗口并确认本次界面文字外发，不会立即操作。' : '最多8次工具调用。权限、方法或隐私设置变化即停止；不自动重试写入。'}</p>
    <footer><button type="button" onClick={() => { execution.stop(); onBack() }}>{execution.busy ? '停止并返回' : '返回方法库'}</button>{execution.busy ? <button type="button" onClick={execution.stop}>停止</button> : <button type="button" className="primary-button" disabled={!consent || !preview || !item.enabled} onClick={start}>{item.scope === 'window' ? '准备窗口任务' : '开始本次任务'}</button>}</footer>
    {execution.status && <p role="status">{execution.status}</p>}
    {execution.permission && <div className="operation-confirm" role="alert"><h4>{copy?.title ?? '确认这次操作？'}</h4><p>{copy?.subject}</p><p>{copy?.detail}</p><button type="button" onClick={() => execution.decide(false)}>取消本次操作</button><button type="button" onClick={() => execution.decide(true)}>仅允许这一次</button></div>}
    {execution.review && <PrivacyReviewCard request={execution.review} onDecision={execution.decide} />}
    {execution.text && <div className="operation-output"><p>{execution.text}</p><small>本次结果只在面板中显示，关闭后不保留。</small></div>}
    {execution.run && <div className="operation-verdict"><p>{operationRunLabels[execution.run.state]}</p>{execution.run.state === 'awaiting_review' && <><button type="button" onClick={() => execution.confirm(true)}>我已核对，确实完成</button><button type="button" onClick={() => execution.confirm(false)}>没有完成，需要调整</button></>}</div>}
    {error && <p role="alert">{error}</p>}
  </div>
}
