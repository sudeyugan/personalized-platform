import { Link2, MapPin, Pin, PinOff, RotateCcw, Trash2, UserRound } from 'lucide-react'
import { useState } from 'react'
import type { EntityRef, RecordType } from '../../domain/models'
import { useLibraryStore } from '../../state/useLibraryStore'
import { linksFor } from '../../state/recordsSlice'

export function RecordLinksPanel({ record }: { record: EntityRef }) {
  const { data, setChapterLink, setRecordLink, selectChapter, updateChapterSession, pinRecord, addPersonRelation, deletePersonRelation } = useLibraryStore()
  const links = linksFor(data, record.type, record.id)
  const chapterLinks = links.filter((link) => link.sourceType === 'chapter')
  const [relationTarget, setRelationTarget] = useState('')
  const [relationType, setRelationType] = useState('亲友')
  const [relationDescription, setRelationDescription] = useState('')
  const [relatedType, setRelatedType] = useState<RecordType>(record.type === 'person' ? 'event' : 'person')
  const [relatedId, setRelatedId] = useState('')
  const pinned = data.session.pinnedRecord?.type === record.type && data.session.pinnedRecord.id === record.id
  const activeChapters = Object.values(data.chapters).filter((chapter) => !chapter.deletedAt)
  const relations = record.type === 'person' ? data.personRelations.filter((relation) => relation.fromPersonId === record.id || relation.toPersonId === record.id) : []
  const recordLinks = links.filter((link) => link.sourceType !== 'chapter' && link.targetType !== 'chapter')
  const relatedRecords = relatedType === 'person' ? data.people : relatedType === 'place' ? data.places : data.events

  return <section className="record-details">
    <header><strong>关联与引用</strong><button onClick={() => pinRecord(pinned ? undefined : record)}>{pinned ? <PinOff size={13} /> : <Pin size={13} />}{pinned ? '取消固定' : '固定到写作侧栏'}</button></header>
    <div className="chapter-link-list">{activeChapters.map((chapter) => { const link = chapterLinks.find((item) => item.sourceId === chapter.id); return <label key={chapter.id}><input type="checkbox" checked={Boolean(link)} onChange={(event) => setChapterLink(chapter.id, record, event.target.checked)} /><span>{chapter.title}</span>{link?.anchor && <button type="button" title="回到正文位置" onClick={() => { selectChapter(chapter.id); updateChapterSession(chapter.id, link.anchor!.from, 0) }}><RotateCcw size={12} />原文</button>}</label> })}</div>
    {record.type === 'person' && <div className="relation-editor"><strong>人物关系</strong>{relations.map((relation) => { const otherId = relation.fromPersonId === record.id ? relation.toPersonId : relation.fromPersonId; const other = data.people.find((person) => person.id === otherId); return <div key={relation.id}><UserRound size={13} /><span>{other?.name} · {relation.relationType}{relation.description && `：${relation.description}`}</span><button onClick={() => deletePersonRelation(relation.id)}><Trash2 size={12} /></button></div> })}<form onSubmit={(event) => { event.preventDefault(); if (relationTarget) addPersonRelation(record.id, relationTarget, relationType.trim() || '相关', relationDescription.trim()); setRelationTarget(''); setRelationDescription('') }}><select aria-label="关联人物" value={relationTarget} onChange={(event) => setRelationTarget(event.target.value)}><option value="">选择人物…</option>{data.people.filter((person) => person.id !== record.id && !person.deletedAt).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select><input aria-label="关系类型" value={relationType} onChange={(event) => setRelationType(event.target.value)} /><input aria-label="关系说明" placeholder="补充关系说明（可选）" value={relationDescription} onChange={(event) => setRelationDescription(event.target.value)} /><button className="ghost-button"><Link2 size={12} />添加</button></form></div>}
    {record.type === 'place' && <p className="detail-hint"><MapPin size={13} />章节勾选后，地点卡和写作侧栏都会显示反向引用。</p>}
    <div className="relation-editor"><strong>关联资料</strong>{recordLinks.map((link) => { const ref = link.sourceType === record.type && link.sourceId === record.id ? { type: link.targetType as RecordType, id: link.targetId } : { type: link.sourceType as RecordType, id: link.sourceId }; const related = ref.type === 'person' ? data.people.find((item) => item.id === ref.id) : ref.type === 'place' ? data.places.find((item) => item.id === ref.id) : data.events.find((item) => item.id === ref.id); return <div key={link.id}><Link2 size={13} /><span>{related && ('title' in related ? related.title : related.name)}</span><button onClick={() => setRecordLink(record, ref, false)}><Trash2 size={12} /></button></div> })}<form onSubmit={(event) => { event.preventDefault(); if (relatedId) setRecordLink(record, { type: relatedType, id: relatedId }, true); setRelatedId('') }}><select aria-label="资料类别" value={relatedType} onChange={(event) => { setRelatedType(event.target.value as RecordType); setRelatedId('') }}><option value="person">人物</option><option value="place">地点</option><option value="event">事件</option></select><select aria-label="关联资料项" value={relatedId} onChange={(event) => setRelatedId(event.target.value)}><option value="">选择资料…</option>{relatedRecords.filter((item) => item.id !== record.id && !item.deletedAt).map((item) => <option key={item.id} value={item.id}>{'title' in item ? item.title : item.name}</option>)}</select><button className="ghost-button"><Link2 size={12} />关联</button></form></div>
  </section>
}
