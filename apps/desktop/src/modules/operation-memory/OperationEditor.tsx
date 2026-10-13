import { useState } from 'react'
import type { OperationDraft, LearnedOperation } from '../../domain/operations/types'
import { operationScopeLabels, emptyOperation } from '../../domain/operations/types'
import { operationDraftOf } from '../../domain/operations/catalog'
import { validateOperationDraft, operationParameters } from '../../domain/operations/method'
import { useLibraryStore } from '../../state/useLibraryStore'

export function OperationEditor({ initial, current, onSaved, onCancel }: { initial?: OperationDraft; current?: LearnedOperation; onSaved(): void; onCancel(): void }) {
  const [draft, setDraft] = useState(initial ?? (current ? operationDraftOf(current) : emptyOperation))
  const [baseline] = useState(current)
  const [steps, setSteps] = useState(draft.steps.join('\n'))
  const [keywords, setKeywords] = useState(draft.keywords.join('、'))
  const [reviewed, setReviewed] = useState(false)
  const [error, setError] = useState('')
  const saveStatus = useLibraryStore(state => state.saveStatus)
  const field = (key: keyof OperationDraft, value: string) => { setDraft(old => ({ ...old, [key]: value })); setReviewed(false) }
  const save = () => {
    try {
      if (!reviewed) throw new Error('请先核对方法和隐私内容')
      const clean = validateOperationDraft({ ...draft, steps: steps.split('\n').map(step => step.trim()).filter(Boolean), keywords: keywords.split(/[、,，]/u).map(word => word.trim()).filter(Boolean) })
      useLibraryStore.getState().saveOperation(clean, baseline?.id, baseline?.revision)
      onSaved()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '方法无法保存') }
  }
  let parameters: string[] = []
  try { parameters = operationParameters({ ...draft, steps: steps.split('\n') }) } catch { /* shown by save validation */ }
  return <form className="operation-editor" onSubmit={event => { event.preventDefault(); save() }}>
    <label>方法名称<input required maxLength={80} value={draft.title} onChange={event => field('title', event.target.value)} placeholder="例如：查询公开信息、查找应用中的资料" /></label>
    <label>执行范围<select value={draft.scope} onChange={event => field('scope', event.target.value)}>{Object.entries(operationScopeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label>想完成什么<textarea required rows={2} maxLength={800} value={draft.goal} onChange={event => field('goal', event.target.value)} placeholder="变化的内容用 {{关键词}} 表示" /></label>
    <label>适用条件<textarea required rows={2} maxLength={800} value={draft.applicability} onChange={event => field('applicability', event.target.value)} placeholder="适用的网站或应用、如何确认对象；不要填写密码" /></label>
    <label>操作步骤<textarea required rows={5} maxLength={8000} value={steps} onChange={event => { setSteps(event.target.value); setReviewed(false) }} placeholder="每行一步，最多8步；描述操作目的，不记录点击坐标或临时控件ID" /></label>
    <label>怎样算完成<textarea required rows={2} maxLength={1500} value={draft.completion} onChange={event => field('completion', event.target.value)} placeholder="应看到哪些当前结果；打开网页或发出动作并不等于完成" /></label>
    <details><summary>匹配与异常处理</summary>
      <label>匹配词<input value={keywords} maxLength={320} onChange={event => { setKeywords(event.target.value); setReviewed(false) }} placeholder="用逗号分隔，例如：查资料、搜索资料" /></label>
      <label>开始前检查<textarea rows={2} maxLength={1500} value={draft.preconditions} onChange={event => field('preconditions', event.target.value)} /></label>
      <label>遇到问题怎么办<textarea required rows={2} maxLength={1500} value={draft.recovery} onChange={event => field('recovery', event.target.value)} /></label>
    </details>
    {parameters.length > 0 && <p className="operation-note">执行时需要填写：{parameters.join('、')}。参数值只用于当次执行。</p>}
    <label className="operation-consent"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />已核对步骤和完成判据；不含密码、Cookie、结果正文或私密原文。保存到本地资料库，随资料备份。</label>
    <p className="operation-note">保存方法不会授予权限或自动执行。浏览器当前通过窗口控件，不保证所有页面可读。</p>
    {error && <p role="alert">{error}</p>}
    {saveStatus === 'error' && <p role="alert">资料保存失败，当前修改尚不能视为已持久保存，请重试。</p>}
    <footer><button type="button" onClick={onCancel}>取消</button><button type="submit" className="primary-button" disabled={!reviewed}>核对并保存方法</button></footer>
  </form>
}
