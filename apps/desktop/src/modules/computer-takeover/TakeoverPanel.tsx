import { useEffect, useState } from 'react'
import { Monitor, Pause, Play, Square, X } from 'lucide-react'
import { createComputerService } from '../../infrastructure/computerService'
import { useLibraryStore } from '../../state/useLibraryStore'
import { PrivacyReviewCard } from '../companion/PrivacyReviewCard'
import { takeoverRequestEvent, type TakeoverWindow } from './types'
import { useTakeover } from './useTakeover'
import { describeTakeoverError } from './errors'
import type { OperationSelection } from '../../domain/operations/types'
import { resolveOperation } from '../../domain/operations/method'
import { openOperationMemory } from '../operation-memory/events'
import './takeover.css'

export function TakeoverPanel() {
  const [open, setOpen] = useState(false)
  const [windows, setWindows] = useState<TakeoverWindow[]>([])
  const [target, setTarget] = useState('')
  const [goal, setGoal] = useState('')
  const [control, setControl] = useState(false)
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const [operation, setOperation] = useState<OperationSelection>()
  const session = useTakeover()
  const settings = useLibraryStore(state => state.data.companion.computer)
  const active = ['observing', 'thinking', 'acting', 'checking', 'waiting', 'paused'].includes(session.progress.phase)
  useEffect(() => {
    const prepare = (event: Event) => {
      if (active) { setOpen(true); return }
      const detail = (event as CustomEvent<{ goal?: unknown; operation?: OperationSelection }>).detail
      setOperation(undefined)
      if (detail?.operation) {
        try {
          const current = useLibraryStore.getState().data.companion.operations?.find(item => item.id === detail.operation!.id)
          if (!current) throw new Error('方法已删除')
          const method = resolveOperation(current, detail.operation)
          if (method.scope !== 'window') throw new Error('方法不是窗口范围')
          setGoal(method.goal); setOperation(detail.operation)
        } catch (reason) { setError(String(reason)); setOpen(true); return }
      } else if (typeof detail?.goal === 'string') setGoal(detail.goal.slice(0, 2000))
      setOpen(true); setConsent(false); setControl(false); setError('')
    }
    window.addEventListener(takeoverRequestEvent, prepare)
    return () => window.removeEventListener(takeoverRequestEvent, prepare)
  }, [active])
  const refresh = async () => {
    try { const rows = await createComputerService(useLibraryStore.getState().data.companion.computer).execute({ action: 'window_list' }, true); setWindows(rows as TakeoverWindow[]); setError('') }
    catch (reason) { setError(String(reason)) }
  }
  const start = async () => { try { setError(''); if (operation) await session.start(target, goal, control, consent, operation); else await session.start(target, goal, control, consent) } catch (reason) { setError(describeTakeoverError(reason)) } }
  const close = async () => { await session.stop(); setOpen(false); setGoal(''); setTarget(''); setWindows([]); setConsent(false); setControl(false) }
  if (!open) return null
  return <aside className="takeover-panel" aria-label="受控电脑接管">
    <header><div><Monitor size={16} /><span><small>限本次选定窗口</small><h2>让小鱼帮忙操作</h2></span></div><button type="button" aria-label="停止并关闭接管" onClick={() => void close()}><X size={17} /></button></header>
    {!active && <form onSubmit={event => { event.preventDefault(); void start() }}>
      <label>操作哪个窗口<div className="takeover-target"><select required aria-label="接管窗口" value={target} onChange={event => { setTarget(event.target.value); setConsent(false) }}><option value="">先读取窗口列表，再选择</option>{windows.map(item => <option key={item.windowId} value={item.windowId}>{item.title}</option>)}</select><button type="button" onClick={() => void refresh()}>刷新</button></div></label>
      <label>希望她做什么<textarea readOnly={Boolean(operation)} required maxLength={2000} rows={2} value={goal} onChange={event => { setGoal(event.target.value); setConsent(false) }} placeholder="例如：在这个窗口搜索‘阅读报告’，不要发送或提交。" /></label>
      {operation && <p className="takeover-hint">按选定方法重新观察。方法不能授权账号或扩大本次窗口范围；要改目标请返回方法库修改。</p>}
      <label className="takeover-choice"><input type="checkbox" checked={control} onChange={event => { setControl(event.target.checked); setConsent(false) }} />允许普通填写与搜索；不勾选只观察</label>
      <label className="takeover-choice"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />同意本任务的控件文字发送给已配置的 DeepSeek；不发送截图，已标记的密码框会排除</label>
      <p className="takeover-hint">最长3分钟、最多8次操作。提交、发送、保存、删除等需你手动处理；不接管管理员窗口、终端或一隅自身。</p>
      <button className="primary-button" type="submit" disabled={!settings.enabled || !target || !goal.trim() || !consent}><Play size={13} />开始本次任务</button>
    </form>}
    {session.progress.phase !== 'idle' && <div className="takeover-progress" role="status"><span>{session.progress.actions} / 8 次操作</span><p>{session.progress.message}</p>{session.progress.target && <small>目标控件：{session.progress.target}</small>}</div>}
    {session.progress.phase === 'waiting' && session.progress.pending?.operation === 'fill' && <p className="takeover-hint">将填写：{session.progress.pending.text}</p>}
    {active && <footer>{session.progress.phase === 'paused' ? <button type="button" onClick={() => void session.resume()}><Play size={13} />重新观察并继续</button> : <button type="button" onClick={() => void session.pause()}><Pause size={13} />暂停</button>}{session.progress.phase === 'waiting' && <button type="button" onClick={() => void session.confirm()}>仅允许这次{session.progress.pending?.operation === 'fill' ? '填写' : '按钮操作'}</button>}<button type="button" onClick={() => void session.stop()}><Square size={13} />停止</button></footer>}
    {session.review && <PrivacyReviewCard request={session.review} onDecision={session.decision} />}
    {session.operationRun?.status === 'awaiting_review' && <div className="takeover-progress"><p>请核对当前窗口是否符合方法的完成判据。</p><button type="button" onClick={() => session.confirmOperation(true)}>我已核对，确实完成</button><button type="button" onClick={() => session.confirmOperation(false)}>没有完成，需要调整</button></div>}
    {!operation && session.progress.phase === 'finished' && <button type="button" onClick={() => { openOperationMemory({ mode: 'edit', draft: { title: '窗口操作方法', goal, scope: 'window', applicability: '在首次操作的同类应用中；每次重新选择窗口并核对身份。', keywords: [], preconditions: '确认正确窗口和账号、当前登录状态以及本次文字外发授权。', steps: ['重新观察窗口，找到本次需要的控件。', '按当前任务操作普通控件，不重放坐标或旧控件ID。', '重新观察当前结果，核对完成判据；请在保存前补充具体方法。'], completion: '请修改为首次实际完成任务时应看到的结果。', recovery: '登录失效、控件缺失、目标歧义或结果不明时暂停，交还用户；不自动重试写入。' } }); void close() }}>核对并记住窗口方法</button>}
    {error && <p role="alert">{error}</p>}
    {!settings.enabled && <p role="alert">请先在 AI 伙伴设置中开启电脑能力。</p>}
  </aside>
}
