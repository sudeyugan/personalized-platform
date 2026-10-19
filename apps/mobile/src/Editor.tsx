import { useEffect, useState } from 'react'
import { editMode, update } from './repository'
export function Editor({ recordKey, value, close }: { recordKey: string; value: Record<string, unknown>; close: () => void }) {
  const field = recordKey.startsWith('diary/') ? 'content' : recordKey.startsWith('ideas/') ? 'draft' : 'note'
  const [title, setTitle] = useState(String(value.title ?? ''))
  const [text, setText] = useState(String(value[field] ?? ''))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { editMode(true); return () => editMode(false) }, [])
  const save = async () => {
    setSaving(true)
    try {
      await update(recordKey, { ...value, title: title.slice(0, 160), [field]: text, ...(recordKey.startsWith('todos/') ? {} : { updatedAt: new Date().toISOString() }), ...(field === 'draft' ? { draftEdited: true, revision: Number(value.revision ?? 0) + 1 } : {}) })
      close()
    } catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败') }
    finally { setSaving(false) }
  }
  return <section className="editor" role="dialog" aria-label="编辑记录"><header><button disabled={saving} onClick={() => { if (title === String(value.title ?? '') && text === String(value[field] ?? '') || confirm('尚未保存，要放弃本次修改吗？')) close() }}>返回</button><span>纸上留一笔</span><button disabled={saving} onClick={() => void save()}>{saving ? '保存中' : '保存'}</button></header><input aria-label="标题" value={title} onChange={e => setTitle(e.target.value)} maxLength={160} placeholder="一个标题"/><textarea aria-label="内容" value={text} onChange={e => setText(e.target.value)} maxLength={field === 'draft' ? 3000 : 30000} placeholder="慢慢写，不必急。" autoFocus/>{error && <p role="alert">{error}</p>}</section>
}
