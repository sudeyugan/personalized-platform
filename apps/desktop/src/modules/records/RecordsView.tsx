import { Link2, MapPin, Pencil, Plus, RotateCcw, Tag, Trash2, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import type { EntityRef } from '../../domain/models'
import { recordText } from '../../i18n/zh-CN'
import { linksFor } from '../../state/recordsSlice'
import { useLibraryStore } from '../../state/useLibraryStore'
import { InlineRecordEditor } from './InlineRecordEditor'
import { RecordLinksPanel } from './RecordLinksPanel'
import { RecordSidePanel } from './RecordSidePanel'
import { formatCustomFields, parseCustomFields, parseList } from './recordFieldFormatting'

type PanelState = { id: string; mode: 'edit' | 'links' } | null
type PendingDeletion = { id: string; name: string; references: number; permanent: boolean } | null

export function RecordsView({ type }: { type: 'people' | 'places' }) {
  const { data, addPerson, addPlace, updatePerson, updatePlace, trashRecord, restoreRecord, permanentlyDeleteRecord } = useLibraryStore()
  const isPeople = type === 'people'
  const recordType = isPeople ? 'person' : 'place'
  const records = isPeople ? data.people : data.places
  const [panel, setPanel] = useState<PanelState>(null)
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion>(null)

  useEffect(() => {
    const activeRecord = data.session.activeRecord
    setPanel(activeRecord?.type === recordType ? { id: activeRecord.id, mode: 'links' } : null)
  }, [data.session.activeRecord, recordType])

  const active = records.filter((record) => !record.deletedAt)
  const deleted = records.filter((record) => record.deletedAt)
  const panelRecord = active.find((record) => record.id === panel?.id)

  return (
    <main className="records-view scroll-view">
      <header className="page-header">
        <div><p className="eyebrow">{recordText.library}</p><h1>{isPeople ? recordText.people : recordText.places}</h1><p>{isPeople ? recordText.personDescription : recordText.placeDescription}</p></div>
        <button className="primary-button" onClick={isPeople ? addPerson : addPlace}><Plus size={16} />{isPeople ? recordText.newPerson : recordText.newPlace}</button>
      </header>

      <section className="record-grid">
        {active.map((record, index) => {
          const references = linksFor(data, recordType, record.id)
          return (
            <article className={panel?.id === record.id ? 'record-card selected' : 'record-card'} key={record.id}>
              <div className={`record-avatar hue-${index % 4}`}>{isPeople ? <UserRound /> : <MapPin />}</div>
              <div className="record-copy">
                <div className="record-title">
                  <h2>{record.name}</h2>
                  <span>
                    <button aria-label={`编辑${record.name}`} onClick={() => setPanel({ id: record.id, mode: 'edit' })}><Pencil size={14} /></button>
                    <button aria-label={`删除${record.name}`} onClick={() => setPendingDeletion({ id: record.id, name: record.name, references: references.length, permanent: false })}><Trash2 size={14} /></button>
                  </span>
                </div>
                <p>{'summary' in record ? record.summary : record.description}</p>
                {record.aliases.map((alias) => <span className="record-tag" key={alias}>别名 · {alias}</span>)}
                {'region' in record && <span className="record-tag"><MapPin size={12} />{record.region}</span>}
                {record.tags.map((tag) => <span className="record-tag" key={tag}><Tag size={12} />{tag}</span>)}
              </div>
              <button className="record-expand" onClick={() => setPanel({ id: record.id, mode: 'links' })}><Link2 size={13} />管理关联 · {references.length} 处引用</button>
            </article>
          )
        })}
      </section>

      {deleted.length > 0 && <section className="record-trash"><h2>{recordText.recycleBin}</h2>{deleted.map((record) => <div key={record.id}><span>{record.name}</span><button onClick={() => restoreRecord(recordType, record.id)}><RotateCcw size={13} />{recordText.restore}</button><button onClick={() => setPendingDeletion({ id: record.id, name: record.name, references: linksFor(data, recordType, record.id).length, permanent: true })}><Trash2 size={13} />{recordText.permanentDelete}</button></div>)}</section>}

      {pendingDeletion && <ConfirmDialog title={pendingDeletion.permanent ? `永久删除${isPeople ? '人物' : '地点'}？` : `将${isPeople ? '人物' : '地点'}移入回收站？`} subject={pendingDeletion.name} description={pendingDeletion.permanent ? '资料本身和相关关系会被清理，正文内容不会被静默改写，但这条资料无法恢复。' : '资料会从当前页面隐藏并进入回收站，正文内容和引用标记保持不变。'} confirmLabel={pendingDeletion.permanent ? '永久删除' : '移入回收站'} permanent={pendingDeletion.permanent} facts={[{ label: '正文与资料引用', value: `${pendingDeletion.references} 处` }, { label: '恢复方式', value: pendingDeletion.permanent ? '无法恢复' : '可从回收站恢复' }]} onCancel={() => setPendingDeletion(null)} onConfirm={() => { if (pendingDeletion.permanent) permanentlyDeleteRecord(recordType, pendingDeletion.id); else trashRecord(recordType, pendingDeletion.id); setPendingDeletion(null) }} />}

      {panelRecord && panel && (
        <RecordSidePanel title={panelRecord.name} eyebrow={panel.mode === 'edit' ? `编辑${isPeople ? '人物' : '地点'}` : '关联与引用'} onClose={() => setPanel(null)}>
          {panel.mode === 'links'
            ? <RecordLinksPanel record={{ type: recordType, id: panelRecord.id } as EntityRef} />
            : <InlineRecordEditor
                key={panelRecord.id}
                fields={isPeople
                  ? [{ key: 'name', label: '姓名', value: panelRecord.name }, { key: 'aliases', label: '别名（逗号分隔）', value: panelRecord.aliases.join(', ') }, { key: 'summary', label: '简介', value: 'summary' in panelRecord ? panelRecord.summary : '', multiline: true }, { key: 'experiences', label: '重要经历', value: 'importantExperiences' in panelRecord ? panelRecord.importantExperiences : '', multiline: true }, { key: 'tags', label: '标签', value: panelRecord.tags.join(', ') }, { key: 'custom', label: '自定义字段（字段：内容；字段：内容）', value: formatCustomFields(panelRecord.customFields) }]
                  : [{ key: 'name', label: '名称', value: panelRecord.name }, { key: 'aliases', label: '别名', value: panelRecord.aliases.join(', ') }, { key: 'region', label: '区域', value: 'region' in panelRecord ? panelRecord.region : '' }, { key: 'address', label: '地址', value: 'address' in panelRecord ? panelRecord.address : '' }, { key: 'period', label: '相关时间段', value: 'relatedPeriod' in panelRecord ? panelRecord.relatedPeriod : '' }, { key: 'description', label: '描述', value: 'description' in panelRecord ? panelRecord.description : '', multiline: true }, { key: 'tags', label: '标签', value: panelRecord.tags.join(', ') }, { key: 'custom', label: '自定义字段', value: formatCustomFields(panelRecord.customFields) }]}
                onCancel={() => setPanel(null)}
                onSave={(values) => {
                  if (isPeople) updatePerson(panelRecord.id, { name: values.name.trim(), aliases: parseList(values.aliases), summary: values.summary.trim(), importantExperiences: values.experiences.trim(), tags: parseList(values.tags), customFields: parseCustomFields(values.custom) })
                  else updatePlace(panelRecord.id, { name: values.name.trim(), aliases: parseList(values.aliases), region: values.region.trim(), address: values.address.trim(), relatedPeriod: values.period.trim(), description: values.description.trim(), tags: parseList(values.tags), customFields: parseCustomFields(values.custom) })
                  setPanel(null)
                }}
              />}
        </RecordSidePanel>
      )}
    </main>
  )
}
