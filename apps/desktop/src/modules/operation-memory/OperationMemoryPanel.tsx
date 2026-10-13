import { useEffect, useState } from 'react'
import { BookOpen, X } from 'lucide-react'
import { useLibraryStore } from '../../state/useLibraryStore'
import { libraryRepository } from '../../infrastructure/libraryRepository'
import type { OperationDraft } from '../../domain/operations/types'
import { validateOperationDraft } from '../../domain/operations/method'
import { operationMemoryEvent, type OperationMemoryRequest, openOperationMemory } from './events'
import { operationTrainingEvent } from './turn'
import { OperationEditor } from './OperationEditor'
import { OperationLibrary } from './OperationLibrary'
import { OperationRunner } from './OperationRunner'
import { moduleStatus } from '../../domain/moduleAvailability'
import './operations.css'

type Screen = { mode: 'library' } | { mode: 'edit'; id?: string; draft?: OperationDraft } | { mode: 'run'; id: string; revision: number }
export function OperationMemoryPanel() {
  const [screen, setScreen] = useState<Screen>()
  const [training, setTraining] = useState<string>()
  const [error, setError] = useState('')
  const data = useLibraryStore(state => state.data)
  const saveStatus = useLibraryStore(state => state.saveStatus)
  const status = moduleStatus(data.settings.modules, 'companion')
  const active = data.companion.operations?.find(item => item.id === (screen && 'id' in screen ? screen.id : undefined))
  useEffect(() => {
    if (!screen) return
    const previous = document.activeElement as HTMLElement | null
    const panel = document.querySelector<HTMLElement>('.operation-panel')
    panel?.querySelector<HTMLElement>('button, input, textarea, select')?.focus()
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setScreen(undefined) }
      if (event.key !== 'Tab' || !panel) return
      const items = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary')].filter(item => item.getClientRects().length > 0)
      const first = items[0], last = items.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', keyboard)
    return () => { document.removeEventListener('keydown', keyboard); if (previous?.isConnected) previous.focus() }
    // focus lifetime follows the visible panel, not each method edit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(screen)])
  useEffect(() => {
    const open = (event: Event) => {
      const request = (event as CustomEvent<OperationMemoryRequest>).detail
      try {
        if (request?.mode === 'library') setScreen({ mode: 'library' })
        else if (request?.mode === 'edit') setScreen({ mode: 'edit', draft: validateOperationDraft(request.draft) })
        else if (request?.mode === 'run' && typeof request.id === 'string' && Number.isSafeInteger(request.revision)) setScreen(request)
        setError('')
      } catch (reason) { setError(String(reason)) }
    }
    const learn = (event: Event) => { const title = (event as CustomEvent<{ learnedTitle: string }>).detail?.learnedTitle; if (typeof title === 'string') setTraining(title.slice(0,80)) }
    window.addEventListener(operationMemoryEvent, open); window.addEventListener(operationTrainingEvent, learn)
    return () => { window.removeEventListener(operationMemoryEvent, open); window.removeEventListener(operationTrainingEvent, learn) }
  }, [])
  useEffect(() => { if (!status.enabled || !status.available) { setScreen(undefined); setTraining(undefined) } }, [status.enabled, status.available])
  if (!status.enabled || !status.available) return null
  const retrySave = async () => {
    const current = useLibraryStore.getState().data
    useLibraryStore.setState({ saveStatus: 'saving' })
    try { await libraryRepository.save(current); if (useLibraryStore.getState().data === current) useLibraryStore.setState({ saveStatus: 'saved' }) } catch { useLibraryStore.setState({ saveStatus: 'error' }) }
  }
  const saved = () => { setScreen({ mode: 'library' }); setTraining(undefined) }
  return <>
    {training && !screen && <aside className="operation-learn-notice" aria-label="自动学习操作方法"><BookOpen size={15} /><span>已自动整理：{training}</span><button type="button" onClick={() => { setScreen({ mode: 'library' }); setTraining(undefined) }}>查看方法</button><button type="button" aria-label="关闭学习提示" onClick={() => setTraining(undefined)}><X size={13} /></button></aside>}
    {screen && <div className="operation-backdrop"><section className="operation-panel" role="dialog" aria-modal="true" aria-label="操作记忆">
      <header><div><small>小鱼的方法册</small><h2>{screen.mode === 'edit' ? '核对操作方法' : screen.mode === 'run' ? '复用记住的方法' : '已学会的操作'}</h2></div><button type="button" aria-label="停止并关闭操作记忆" onClick={() => { setScreen(undefined); setError('') }}><X size={18} /></button></header>
      {screen.mode === 'library' && <OperationLibrary onCreate={() => setScreen({ mode: 'edit' })} onEdit={item => setScreen({ mode: 'edit', id: item.id })} onRun={item => setScreen({ mode: 'run', id: item.id, revision: item.revision })} />}
      {screen.mode === 'edit' && (!screen.id || active) && <OperationEditor key={screen.id ?? (screen.draft ? 'proposal' : 'new')} initial={screen.draft} current={active} onSaved={saved} onCancel={() => setScreen({ mode: 'library' })} />}
      {screen.mode === 'run' && active && active.revision === screen.revision && active.enabled && <OperationRunner key={`${active.id}-${active.revision}`} item={active} onBack={() => setScreen({ mode: 'library' })} onWindowReady={() => setScreen(undefined)} />}
      {((screen.mode === 'run' && (!active || !active.enabled || active.revision !== screen.revision)) || (screen.mode === 'edit' && screen.id && !active)) && <p role="alert">方法已编辑、停用或删除。<button type="button" onClick={() => setScreen({ mode: 'library' })}>重新选择</button></p>}
      {saveStatus === 'saving' && <p className="operation-note" role="status">资料正在保存到本机……</p>}
      {saveStatus === 'error' && <p role="alert">资料未能保存；当前修改仍在内存中。<button type="button" onClick={() => void retrySave()}>重试保存</button></p>}
      {error && <p role="alert">{error}</p>}
    </section></div>}
  </>
}
export function OperationMemoryEntry() { return <button type="button" className="ghost-button" onClick={() => openOperationMemory({ mode: 'library' })}><BookOpen size={14} />已学会的操作</button> }
