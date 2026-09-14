import type { Editor } from '@tiptap/react'
import { Link2, MapPin, Plus, Tag, UserRound, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { EntityRef, RecordType, TextAnchor } from '../../domain/models'
import { useLibraryStore } from '../../state/useLibraryStore'

const typeLabels: Record<RecordType, string> = { person: '人物', place: '地点', event: '事件' }

interface Selection { from: number; to: number; text: string }
interface Props { chapterId: string; editor: Editor; selection: Selection; onClose: () => void }

export function EntityTagMenu({ chapterId, editor, selection, onClose }: Props) {
  const { data, createRecordFromText, setChapterLink } = useLibraryStore()
  const [type, setType] = useState<RecordType>('person')
  const [targetId, setTargetId] = useState('')
  const records = type === 'person' ? data.people : type === 'place' ? data.places : data.events
  const activeRecords = useMemo(() => records.filter((record) => !record.deletedAt), [records])
  const anchor: TextAnchor = { ...selection, excerpt: selection.text.slice(0, 60) }

  const apply = (target: EntityRef, label: string) => {
    editor.chain().focus().setTextSelection({ from: selection.from, to: selection.to }).setEntityReference({ entityType: target.type, entityId: target.id, label }).run()
    onClose()
  }
  const linkExisting = () => {
    const record = activeRecords.find((item) => item.id === targetId)
    if (!record) return
    setChapterLink(chapterId, { type, id: record.id }, true, anchor)
    apply({ type, id: record.id }, 'title' in record ? record.title : record.name)
  }
  const create = () => {
    const target = createRecordFromText(type, selection.text, chapterId, anchor)
    apply(target, selection.text)
  }

  return <section className="entity-tag-menu" aria-label="标记选中文字"><header><div><Tag size={15} /><strong>把“{selection.text}”标记为资料</strong></div><button aria-label="关闭资料标记" onClick={onClose}><X size={15} /></button></header>
    <div className="entity-type-tabs">{(['person', 'place', 'event'] as const).map((item) => <button key={item} className={type === item ? 'active' : ''} onClick={() => { setType(item); setTargetId('') }}>{item === 'person' ? <UserRound size={14} /> : item === 'place' ? <MapPin size={14} /> : <Link2 size={14} />}{typeLabels[item]}</button>)}</div>
    <div className="entity-tag-actions"><select aria-label={`选择已有${typeLabels[type]}`} value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">选择已有{typeLabels[type]}…</option>{activeRecords.map((record) => <option key={record.id} value={record.id}>{'title' in record ? record.title : record.name}</option>)}</select><button className="ghost-button" disabled={!targetId} onClick={linkExisting}><Link2 size={13} />关联并标记</button></div>
    <button className="primary-button" onClick={create}><Plus size={14} />新建{typeLabels[type]}“{selection.text}”并标记</button>
    <small>标记会随正文保存并建立反向引用；AI 印象图可在发送前把它替换为匿名代号。</small>
  </section>
}
