import { useEffect, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useLibraryStore } from '../../state/useLibraryStore'
import { moduleStatus } from '../../domain/moduleAvailability'
import { createCompanionProvider } from '../../infrastructure/companionProvider'
import { createPrivacyProtectedProvider, type PrivacyReviewRequest } from '../privacy'
import { assertExternalAiAllowed } from '../trust/trustPolicy'
import { buildAgentContext, buildAgentAccess } from '../companion/agent/context'
import { takeoverNative } from './service'
import { decideTakeover } from './model'
import { TakeoverRunner } from './runner'
import { createTakeoverAudit } from './audit'
import type { TakeoverProgress } from './types'
import type { OperationSelection } from '../../domain/operations/types'
import { resolveOperation, methodInstruction } from '../../domain/operations/method'
import { assertOperationAccess } from '../operation-memory/services'

export function useTakeover() {
  const [progress, setProgress] = useState<TakeoverProgress>({ phase: 'idle', actions: 0, message: '' })
  const [review, setReview] = useState<PrivacyReviewRequest>()
  const [operationRun, setOperationRun] = useState<{ selection: OperationSelection; id: string; status: 'awaiting_review' | 'handoff' | 'error' | 'cancelled'; count: number }>()
  const reviewResolve = useRef<(allowed: boolean) => void>(undefined)
  const runner = useRef<TakeoverRunner>(undefined)
  const launch = useRef<symbol>(undefined)
  const data = useLibraryStore(state => state.data)
  const decision = (allowed: boolean) => { reviewResolve.current?.(allowed); reviewResolve.current = undefined; setReview(undefined) }
  const release = async () => { decision(false); const active = runner.current; runner.current = undefined; await active?.stop() }
  const stop = async () => { launch.current = undefined; await release() }
  const finish = async (active: TakeoverRunner, operation: Promise<void>) => { await operation; if (runner.current === active && !active.resumable) runner.current = undefined }
  useEffect(() => {
    let disposed = false; let unlisten: (() => void) | undefined
    const localStop = () => { void stop() }
    window.addEventListener('yiyu:computer-stop', localStop)
    if ('__TAURI_INTERNALS__' in window) void listen('computer:emergency-stop', () => { void stop() }).then(off => { if (disposed) off(); else unlisten = off }).catch(() => undefined)
    return () => { disposed = true; launch.current = undefined; unlisten?.(); window.removeEventListener('yiyu:computer-stop', localStop); reviewResolve.current?.(false); void runner.current?.stop() }
    // Singleton main-window runtime. No private data is subscribed to the desktop companion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    const module = moduleStatus(data.settings.modules, 'companion')
    if (!module.enabled || !module.available || !data.companion.computer.enabled || !data.settings.trust.externalAiProcessing || data.companion.provider.providerId !== 'deepseek') void stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.settings.modules, data.companion.computer.enabled, data.settings.trust.externalAiProcessing, data.companion.provider.providerId, data.companion.provider.endpoint, data.companion.provider.model])
  const start = async (windowId: string, goal: string, control: boolean, consent: boolean, operation?: OperationSelection) => {
    if (!consent || !windowId || !goal.trim()) throw new Error('请选定窗口、填写目标，并确认本次界面文字外发')
    if (launch.current) throw new Error('正在准备本次接管，请不要重复点击开始。')
    const token = Symbol('takeover-launch'); launch.current = token
    try {
      await release()
      if (launch.current !== token) throw new DOMException('接管启动已取消', 'AbortError')
      const initial = useLibraryStore.getState().data
      const learned = operation ? initial.companion.operations?.find(item => item.id === operation.id) : undefined
      if (operation) { assertOperationAccess(); if (!learned) throw new Error('方法已删除'); resolveOperation(learned, operation) }
      const method = learned && operation ? resolveOperation(learned, operation) : undefined
      if (method && method.scope !== 'window') throw new Error('这个方法不是窗口执行范围')
      setOperationRun(undefined)
      if (initial.companion.provider.providerId !== 'deepseek') throw new Error('请先配置已接入的 DeepSeek 对话模型；本地 Mock 不会接管电脑')
      const identity = JSON.stringify({ provider: initial.companion.provider, trust: initial.settings.trust, computer: initial.companion.computer })
      const assertAllowed = () => {
        const live = useLibraryStore.getState().data
        if (operation) {
          assertOperationAccess()
          const current = live.companion.operations?.find(item => item.id === operation.id)
          if (!current || !current.enabled || current.revision !== operation.revision) throw new Error('方法已改变或停用，请重新确认')
        }
        const module = moduleStatus(live.settings.modules, 'companion')
        if (!module.enabled || !module.available) throw new Error('AI伙伴模块已关闭或不可用，接管已停止')
        if (!live.companion.computer.enabled) throw new Error('电脑能力已关闭，接管已停止')
        assertExternalAiAllowed(live.companion.provider.providerId, live.settings.trust, 'companion')
        if (JSON.stringify({ provider: live.companion.provider, trust: live.settings.trust, computer: live.companion.computer }) !== identity) throw new Error('模型、隐私或电脑权限已变更，请重新确认接管')
        if (live.companion.tasks.some(task => ['queued', 'preparing', 'running'].includes(task.status))) throw new Error('请先暂停现有任务，避免两个任务同时操作电脑')
      }
      assertAllowed()
      const baseProvider = createCompanionProvider(initial.companion.provider)
      const provider = createPrivacyProtectedProvider({ ...baseProvider, id: baseProvider.id,
        testConnection: () => baseProvider.testConnection(),
        generate: (request, options) => { assertAllowed(); if (options?.signal?.aborted) throw new DOMException('接管已取消', 'AbortError'); return baseProvider.generate(request, options) },
      }, {
        trust: { ...initial.settings.trust, outboundProtection: true }, destination: 'DeepSeek', purpose: '选定窗口的受控电脑接管',
        requestReview: request => new Promise(resolve => { reviewResolve.current = resolve; setReview(request) }),
      })
      const safeContext = () => { const live = useLibraryStore.getState().data; const context = buildAgentContext(live, buildAgentAccess(live, [])); return { page: 'computer-takeover', companion: context.companion, localTime: context.localTime } }
      const policy = () => useLibraryStore.getState().data.companion.computer
      const audit = createTakeoverAudit()
      const active = new TakeoverRunner({ windowId, control, assertAllowed, progress: setProgress,
        native: {
          begin: (windowId, mode) => audit('begin', true, async () => (await takeoverNative<{ sessionId: string }>({ action: 'begin', windowId, mode }, policy(), true)).sessionId),
          observe: sessionId => audit('observe', false, () => takeoverNative({ action: 'observe', sessionId }, policy())),
          act: (sessionId, revision, action, confirmed) => audit(action.operation, confirmed, () => takeoverNative({ action: 'act', sessionId, revision, ...action }, policy(), confirmed)),
          end: sessionId => audit('end', false, async () => { await takeoverNative({ action: 'end', sessionId }, policy()) }),
        },
        decide: (observation, result, signal) => decideTakeover(provider, safeContext(), method?.goal ?? goal.trim().slice(0, 2000), observation, control, result, signal, method ? methodInstruction(method) : undefined),
        result: (status, count) => { if (operation) { const id = useLibraryStore.getState().recordOperationRun(operation.id, operation.revision, status, count); if (id) setOperationRun({ selection: operation, id, status, count }) } },
      })
      runner.current = active
      setProgress({ phase: 'observing', actions: 0, message: '正在申请选定窗口的本次接管，不操作其他窗口。' })
      launch.current = undefined
      await finish(active, active.start())
    } finally { if (launch.current === token) launch.current = undefined }
  }
  const confirmOperation = (success: boolean) => {
    if (!operationRun || operationRun.status !== 'awaiting_review') return
    const { selection, id, count } = operationRun
    useLibraryStore.getState().recordOperationRun(selection.id, selection.revision, success ? 'confirmed' : 'handoff', count, id)
    setOperationRun(undefined)
  }
  return { progress, review, decision, start, stop, operationRun, confirmOperation, pause: async () => { decision(false); await runner.current?.pause() }, resume: () => { const active = runner.current; return active && finish(active, active.resume()) }, confirm: () => { const active = runner.current; return active && finish(active, active.confirmAction()) } }
}
