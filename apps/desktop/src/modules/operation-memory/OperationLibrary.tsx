import { useState } from 'react'
import { BookOpen, Edit3, Play, Trash2 } from 'lucide-react'
import { useLibraryStore } from '../../state/useLibraryStore'
import { operationScopeLabels, operationRunLabels, type LearnedOperation } from '../../domain/operations/types'

export function OperationLibrary({ onEdit, onRun, onCreate }: { onEdit(item: LearnedOperation): void; onRun(item: LearnedOperation): void; onCreate(): void }) {
  const stored = useLibraryStore(state => state.data.companion.operations)
  const learning = useLibraryStore(state => state.data.companion.operationLearning?.enabled !== false)
  const methods = stored ?? []
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState<string>()
  const action = (operation: () => void) => { try { operation(); setError('') } catch (reason) { setError(String(reason)) } }
  const filtered = methods.filter(item => `${item.title}\n${item.goal}\n${item.keywords.join(' ')}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  return <div className="operation-library">
    <div className="operation-library-tools"><input aria-label="搜索操作方法" value={query} onChange={event => setQuery(event.target.value)} placeholder="查找记住的方法" /><button type="button" onClick={onCreate}>手动补充</button></div>
    <label className="operation-note operation-learning-toggle"><input type="checkbox" checked={learning} onChange={event => action(() => useLibraryStore.getState().setOperationLearning(event.target.checked))} /> 成功操作后自动学习</label>
    <p className="operation-note">自动整理工具流程，不保存页面正文或账号。下次按现场重新执行，不重放旧结果；权限与确认仍独立。删除的方法不再自动学回。</p>
    {!filtered.length && <div className="operation-empty"><BookOpen size={25} /><p>{methods.length ? '没有匹配的方法。' : '还没有学会的方法。开启自动学习后，成功完成适用操作就会自动整理，不用填表。'}</p></div>}
    {filtered.map(item => <article className="operation-card" key={item.id}>
      <div><small>{operationScopeLabels[item.scope]} · {item.source === 'automatic' ? '自动学习' : '手动整理'} · 第 {item.revision} 版{!item.enabled && ' · 已停用'}</small><h3>{item.title}</h3><p>{item.goal}</p></div>
      <div className="operation-card-actions"><button type="button" onClick={() => onRun(item)} disabled={!item.enabled} aria-label={`使用方法 ${item.title}`}><Play size={13} />使用</button><button type="button" onClick={() => onEdit(item)} aria-label={`编辑方法 ${item.title}`}><Edit3 size={13} /></button><button type="button" onClick={() => action(() => useLibraryStore.getState().setOperationEnabled(item.id, item.revision, !item.enabled))}>{item.enabled ? '停用' : '启用'}</button><button type="button" aria-label={`删除方法 ${item.title}`} onClick={() => setDeleting(item.id)}><Trash2 size={13} /></button></div>
      {deleting === item.id && <div className="operation-delete"><span>删除方法及其运行记录？不会撤销以前的操作；备份仍可能保留。</span><button type="button" onClick={() => action(() => { useLibraryStore.getState().deleteOperation(item.id, item.revision); setDeleting(undefined) })}>确认删除</button><button type="button" onClick={() => setDeleting(undefined)}>取消</button></div>}
      <details><summary>条件、步骤与最近运行</summary><p>{item.applicability}</p><ol>{item.steps.map((step, index) => <li key={index}>{step}</li>)}</ol><p>完成判据：{item.completion}</p><p>异常处理：{item.recovery}</p>{item.runs.length ? <ul className="operation-runs">{item.runs.slice().reverse().map(run => <li key={run.id}>{new Date(run.at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} · 第{run.revision}版 · {operationRunLabels[run.status]} · {run.toolCount}次工具操作</li>)}</ul> : <p>还没有运行记录。</p>}</details>
    </article>)}
    {error && <p role="alert">{error}</p>}
  </div>
}
