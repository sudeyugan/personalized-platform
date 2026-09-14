import { ArrowDown, ArrowUp, CalendarDays, Link2, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { recordText } from '../../i18n/zh-CN'
import { compareEvents, linksFor } from '../../state/recordsSlice'
import { useLibraryStore } from '../../state/useLibraryStore'
import { InlineRecordEditor } from './InlineRecordEditor'
import { RecordLinksPanel } from './RecordLinksPanel'
import { RecordSidePanel } from './RecordSidePanel'
import { formatCustomFields, parseCustomFields } from './recordFieldFormatting'

const precisionOptions = [...recordText.precisionOptions]
type PanelState = { id: string; mode: 'edit' | 'links' } | null
type PendingDeletion = { id: string; title: string; references: number; permanent: boolean } | null

export function TimelineView() {
  const { data, addEvent, updateEvent, trashRecord, restoreRecord, permanentlyDeleteRecord, moveEvent } = useLibraryStore()
  const [panel, setPanel] = useState<PanelState>(null)
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion>(null)

  useEffect(() => {
    const activeRecord = data.session.activeRecord
    setPanel(activeRecord?.type === 'event' ? { id: activeRecord.id, mode: 'links' } : null)
  }, [data.session.activeRecord])

  const events = data.events.filter((event) => !event.deletedAt).sort(compareEvents)
  const deleted = data.events.filter((event) => event.deletedAt)
  const panelEvent = events.find((event) => event.id === panel?.id)

  return (
    <main className="timeline-view scroll-view">
      <header className="page-header"><div><p className="eyebrow">{recordText.timeline}</p><h1>{recordText.timelineTitle}</h1><p>{recordText.timelineDescription}</p></div><button className="primary-button" onClick={addEvent}><Plus size={16} />{recordText.newEvent}</button></header>
      <section className="timeline">
        {events.map((event) => {
          const references = linksFor(data, 'event', event.id)
          return (
            <article className="timeline-item" key={event.id}>
              <div className="timeline-marker"><CalendarDays size={16} /></div>
              <div className="timeline-time">{event.displayTime}<small>{precisionOptions.find((item) => item.value === event.precision)?.label}</small></div>
              <div className={panel?.id === event.id ? 'timeline-card selected' : 'timeline-card'}>
                <div className="record-title"><h2>{event.title}</h2><span><button title="上移同时间段顺序" onClick={() => moveEvent(event.id, -1)}><ArrowUp size={13} /></button><button title="下移同时间段顺序" onClick={() => moveEvent(event.id, 1)}><ArrowDown size={13} /></button><button aria-label={`编辑${event.title}`} onClick={() => setPanel({ id: event.id, mode: 'edit' })}><Pencil size={14} /></button><button aria-label={`删除${event.title}`} onClick={() => setPendingDeletion({ id: event.id, title: event.title, references: references.length, permanent: false })}><Trash2 size={14} /></button></span></div>
                <p>{event.description}</p>
                <button className="record-expand" onClick={() => setPanel({ id: event.id, mode: 'links' })}><Link2 size={13} />管理关联 · {references.length} 处引用</button>
              </div>
            </article>
          )
        })}
      </section>

      {deleted.length > 0 && <section className="record-trash"><h2>{recordText.eventRecycleBin}</h2>{deleted.map((event) => <div key={event.id}><span>{event.title}</span><button onClick={() => restoreRecord('event', event.id)}><RotateCcw size={13} />{recordText.restore}</button><button onClick={() => setPendingDeletion({ id: event.id, title: event.title, references: linksFor(data, 'event', event.id).length, permanent: true })}><Trash2 size={13} />{recordText.permanentDelete}</button></div>)}</section>}

      {pendingDeletion && <ConfirmDialog title={pendingDeletion.permanent ? '永久删除事件？' : '将事件移入回收站？'} subject={pendingDeletion.title} description={pendingDeletion.permanent ? '事件本身和相关关系会被清理，正文内容不会被静默改写，但这条事件无法恢复。' : '事件会从时间线隐藏并进入回收站，正文内容和引用标记保持不变。'} confirmLabel={pendingDeletion.permanent ? '永久删除' : '移入回收站'} permanent={pendingDeletion.permanent} facts={[{ label: '正文与资料引用', value: `${pendingDeletion.references} 处` }, { label: '恢复方式', value: pendingDeletion.permanent ? '无法恢复' : '可从事件回收站恢复' }]} onCancel={() => setPendingDeletion(null)} onConfirm={() => { if (pendingDeletion.permanent) permanentlyDeleteRecord('event', pendingDeletion.id); else trashRecord('event', pendingDeletion.id); setPendingDeletion(null) }} />}

      {panelEvent && panel && (
        <RecordSidePanel title={panelEvent.title} eyebrow={panel.mode === 'edit' ? '编辑事件' : '关联与引用'} onClose={() => setPanel(null)}>
          {panel.mode === 'links'
            ? <RecordLinksPanel record={{ type: 'event', id: panelEvent.id }} />
            : <InlineRecordEditor
                key={panelEvent.id}
                fields={[{ key: 'title', label: '事件名称', value: panelEvent.title }, { key: 'precision', label: '时间精度', value: panelEvent.precision, options: precisionOptions }, { key: 'displayTime', label: '原始时间写法', value: panelEvent.displayTime, placeholder: '例如：约 1998 年夏天' }, { key: 'startDate', label: '开始日期/排序日期', value: panelEvent.startDate ?? panelEvent.sortTime ?? '', placeholder: 'YYYY、YYYY-MM 或 YYYY-MM-DD' }, { key: 'endDate', label: '结束日期', value: panelEvent.endDate ?? '' }, { key: 'description', label: '事件描述', value: panelEvent.description, multiline: true }, { key: 'custom', label: '自定义字段', value: formatCustomFields(panelEvent.customFields) }]}
                onCancel={() => setPanel(null)}
                onSave={(values) => {
                  updateEvent(panelEvent.id, { title: values.title.trim(), precision: values.precision as typeof panelEvent.precision, displayTime: values.displayTime.trim(), startDate: values.startDate.trim() || undefined, endDate: values.endDate.trim() || undefined, sortTime: values.startDate.trim() || undefined, description: values.description.trim(), customFields: parseCustomFields(values.custom) })
                  setPanel(null)
                }}
              />}
        </RecordSidePanel>
      )}
    </main>
  )
}
