import { useEffect, useRef, useState } from 'react'
import { Feather } from 'lucide-react'
import type { IdeaSession } from '../../domain/ideas/types'
import { IDEA_LIMITS } from '../../domain/ideas/types'
import { useLibraryStore } from '../../state/useLibraryStore'

export function ManuscriptSheet({ session, busy }: { session: IdeaSession; busy: boolean }) {
  const [draft, setDraft] = useState(session.draft)
  const value = useRef(draft); value.current = draft
  const dirty = useRef(false)
  const frame = session.turns.at(-1)?.frame
  const save = () => { if (dirty.current) { dirty.current = false; useLibraryStore.getState().editIdeaDraft(session.id, value.current) } }
  useEffect(() => { if (!dirty.current) setDraft(session.draft) }, [session.draft])
  useEffect(() => { const timer = setTimeout(save, 450); return () => clearTimeout(timer) }, [draft, session.id]) // eslint-disable-line react-hooks/exhaustive-deps -- Flush the current local edit, not a stale render value.
  useEffect(() => () => { if (dirty.current) useLibraryStore.getState().editIdeaDraft(session.id, value.current) }, [session.id])
  return <aside className="idea-manuscript" aria-label="想法手稿">
    <header><span className="idea-eyebrow">正在成形 · MANUSCRIPT</span><Feather size={16} strokeWidth={1.2} /></header>
    <h2>留在纸上的想法</h2>
    <p className="idea-caption">{session.draftEdited ? '这是你修改过的手稿，新建议不会自动覆盖。' : '以下是模型的暂定整理，你可以直接修改。'}</p>
    <textarea className="idea-draft" aria-label="编辑我的手稿" placeholder="想法清晰一点，就在这里留下几笔。" value={draft} maxLength={IDEA_LIMITS.draft} disabled={busy} onChange={event => { dirty.current = true; setDraft(event.target.value) }} onBlur={save} />
    <div className="idea-sheet-foot"><span>{draft.length} / {IDEA_LIMITS.draft}</span><span>修改后自动保存</span></div>
    {session.draftEdited && frame && frame.manuscript !== session.draft && <details className="idea-suggestion"><summary>看看本轮的新整理</summary><p>{frame.manuscript}</p><button type="button" className="idea-text-button" disabled={busy} onClick={() => useLibraryStore.getState().adoptIdeaDraft(session.id, frame.manuscript)}>用这版替换手稿 · 原稿留在旧版中</button></details>}
    {!!session.draftVersions.length && <details className="idea-suggestion"><summary>手稿旧版 · {session.draftVersions.length}</summary>{session.draftVersions.slice(-3).reverse().map((text, index) => <button className="idea-version" key={`${index}-${text.slice(0, 20)}`} disabled={busy} onClick={() => useLibraryStore.getState().adoptIdeaDraft(session.id, text)}><span>{text.slice(0, 100)}</span><small>恢复这版</small></button>)}</details>}
    {!!frame?.uncertainties.length && <section className="idea-unsettled"><h3>还可以再想想</h3><ul>{frame.uncertainties.map((item, index) => <li key={index}>{item}</li>)}</ul></section>}
    {session.status === 'collected' && frame?.nextStep && <section className="idea-next-step"><h3>可以试的一小步</h3><p>{frame.nextStep}</p></section>}
    <details className="idea-original"><summary>最初的一念 · 你的原话</summary><p>{session.seed}</p></details>
  </aside>
}
