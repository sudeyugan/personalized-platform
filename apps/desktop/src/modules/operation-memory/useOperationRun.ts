import { useEffect, useRef, useState } from 'react'
import { useLibraryStore } from '../../state/useLibraryStore'
import { sendCompanionTurn } from '../companion/companionConversation'
import type { AgentPermissionRequest } from '../companion/agent/types'
import type { PrivacyReviewRequest } from '../privacy'
import type { OperationSelection, OperationRunStatus } from '../../domain/operations/types'

export function useOperationRun(selection: OperationSelection) {
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState('')
  const [status, setStatus] = useState('')
  const [permission, setPermission] = useState<AgentPermissionRequest>()
  const [review, setReview] = useState<PrivacyReviewRequest>()
  const [run, setRun] = useState<{ id: string; state: OperationRunStatus; count: number }>()
  const abort = useRef<AbortController>(undefined)
  const resolve = useRef<(allow: boolean) => void>(undefined)
  const decide = (allow: boolean) => { resolve.current?.(allow); resolve.current = undefined; setPermission(undefined); setReview(undefined) }
  const stop = () => { abort.current?.abort(); decide(false) }
  useEffect(() => {
    window.addEventListener('yiyu:computer-stop', stop)
    return () => { window.removeEventListener('yiyu:computer-stop', stop); abort.current?.abort(); resolve.current?.(false) }
    // one explicit selection per mounted runner
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const start = async () => {
    if (abort.current) return
    const controller = new AbortController(); abort.current = controller
    setBusy(true); setText(''); setRun(undefined)
    let receipt: { state: OperationRunStatus; count: number } = { state: 'handoff', count: 0 }
    try {
      const reply = await sendCompanionTurn('', { operation: selection, signal: controller.signal,
        onStatus: value => setStatus(value && 'toolName' in value ? `正在使用 ${value.toolName}` : value ? '正在核对与执行' : ''),
        requestPermission: request => new Promise(done => { resolve.current = done; setPermission(request) }),
        requestPrivacyReview: request => new Promise(done => { resolve.current = done; setReview(request) }),
        onOperationReceipt: (state, count) => { receipt = { state, count } },
      })
      setText(reply)
    } catch (reason) { receipt.state = controller.signal.aborted ? 'cancelled' : 'error'; setText(controller.signal.aborted ? '已停止，不再执行下一步。已发出的动作或请求无法撤回。' : reason instanceof Error ? reason.message : '执行失败') }
    finally {
      const id = useLibraryStore.getState().recordOperationRun(selection.id, selection.revision, receipt.state, receipt.count)
      if (id) setRun({ id, ...receipt })
      abort.current = undefined; setBusy(false); setStatus(''); decide(false)
    }
  }
  const confirm = (success: boolean) => {
    if (!run || run.state !== 'awaiting_review') return
    const state = success ? 'confirmed' : 'handoff'
    useLibraryStore.getState().recordOperationRun(selection.id, selection.revision, state, run.count, run.id)
    setRun({ ...run, state })
  }
  return { busy, text, status, permission, review, decide, start, stop, run, confirm }
}
