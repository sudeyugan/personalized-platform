import { Archive, CornerUpLeft, Plus, Sprout, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { IdeaData } from '../../domain/ideas/types'
import { useLibraryStore } from '../../state/useLibraryStore'

export function IdeaNotebook({ data, onNew, onSelect }: { data: IdeaData; onNew(): void; onSelect(id: string): void }) {
  const [archived, setArchived] = useState(false)
  const sessions = data.sessions.filter(item => Boolean(item.deletedAt) === archived).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return <nav className="idea-notebook" aria-label="我的想法手稿册">
    <div className="idea-notebook-heading"><span><Sprout size={16} /> 手稿册</span><button type="button" className="idea-small-icon" aria-label="写下新的想法" onClick={onNew}><Plus size={17} /></button></div>
    <button type="button" className={`idea-archive-toggle${archived ? ' selected' : ''}`} aria-pressed={archived} onClick={() => setArchived(!archived)}><Archive size={13} />{archived ? '返回手稿' : '收纳袋'}<span>{data.sessions.filter(item => item.deletedAt).length || ''}</span></button>
    <div className="idea-notebook-list">{sessions.map(item => <div className={`idea-notebook-item${item.id === data.activeId ? ' selected' : ''}`} key={item.id} data-navigation-target={item.id}>
      <button type="button" className="idea-notebook-open" onClick={() => archived ? useLibraryStore.getState().trashIdea(item.id, false) : onSelect(item.id)} aria-label={archived ? `取回手稿：${item.title}` : `打开手稿：${item.title}`}>
        <span className="idea-notebook-mark">{archived ? <CornerUpLeft size={14} /> : item.status === 'collected' ? '成' : '酝'}</span><strong>{item.title}</strong><small>{item.forkOf ? '另一条思路 · ' : ''}{item.turns.length ? `${item.turns.length} 次推敲` : '尚待落笔'}</small>
      </button>
      {!archived && <button type="button" className="idea-small-icon idea-put-away" aria-label={`收起手稿：${item.title}`} title="移入收纳袋，可取回" onClick={() => useLibraryStore.getState().trashIdea(item.id, true)}><Trash2 size={13} /></button>}
    </div>)}</div>
    {!sessions.length && <p className="idea-notebook-empty">{archived ? '这里还没有收起的手稿。' : '不必完整，\n先留下一点念头。'}</p>}
    <p className="idea-notebook-note">纸上有痕，<br />思绪有处可回。</p>
  </nav>
}
