import type { Editor } from '@tiptap/react'
import { Link2, MapPin, PinOff, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { EntityRef, RecordType } from '../../domain/models'
import { useLibraryStore } from '../../state/useLibraryStore'
import { recordByRef } from '../../state/recordsSlice'

export function WritingRecordPanel({ chapterId, editor }: { chapterId: string; editor: Editor }) {
  const { data, setChapterLink, openRecord, pinRecord } = useLibraryStore(); const [kind, setKind] = useState<RecordType>('person'); const [targetId, setTargetId] = useState('')
  const records = kind === 'person' ? data.people : kind === 'place' ? data.places : data.events
  const linked = useMemo(() => data.entityLinks.filter((link) => link.sourceType === 'chapter' && link.sourceId === chapterId), [data.entityLinks, chapterId])
  const pinned = recordByRef(data, data.session.pinnedRecord)
  const label = (ref: EntityRef) => { const record = recordByRef(data, ref); return record && ('title' in record ? record.title : record.name) }
  return <section className="context-section writing-records"><div className="context-heading"><p className="context-label">关联资料</p><Link2 size={14} /></div>{pinned && <div className="pinned-record"><strong>已固定 · {'title' in pinned ? pinned.title : pinned.name}</strong><p>{'summary' in pinned ? pinned.summary : pinned.description}</p><button onClick={() => pinRecord()}><PinOff size={12} />取消固定</button></div>}<div className="linked-records">{linked.map((link) => { const ref = { type: link.targetType as RecordType, id: link.targetId }; return <button key={link.id} onClick={() => openRecord(ref)}>{ref.type === 'person' ? <UserRound size={13} /> : ref.type === 'place' ? <MapPin size={13} /> : <Link2 size={13} />}<span>{label(ref)}</span>{link.anchor && <small>“{link.anchor.excerpt || '正文锚点'}”</small>}</button> })}{linked.length === 0 && <p className="muted-copy">尚未关联人物、地点或事件。</p>}</div><form className="link-record-form" onSubmit={(event) => { event.preventDefault(); if (!targetId) return; const { from, to } = editor.state.selection; const excerpt = editor.state.doc.textBetween(from, to, ' ').slice(0, 60); setChapterLink(chapterId, { type: kind, id: targetId }, true, { from, to, excerpt }); setTargetId('') }}><select aria-label="资料类型" value={kind} onChange={(event) => { setKind(event.target.value as RecordType); setTargetId('') }}><option value="person">人物</option><option value="place">地点</option><option value="event">事件</option></select><select aria-label="选择资料" value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">选择资料…</option>{records.filter((record) => !record.deletedAt).map((record) => <option key={record.id} value={record.id}>{'title' in record ? record.title : record.name}</option>)}</select><button className="ghost-button"><Link2 size={12} />关联{editor.state.selection.empty ? '章节' : '选中文字'}</button></form></section>
}
