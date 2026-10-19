import { useState } from 'react'
import type { Records } from '@yiyu/sync'
import { RecordForm } from '../components/RecordForm'
import { today, text } from '../data'
import { update } from '../repository'
import type { Action } from './HomePage'
export function DiaryPage({
  records,
  target,
  action,
}: {
  records: Records
  target?: string
  action: Action
}) {
  const [date, setDate] = useState(target?.startsWith('diary/') ? target.slice(6) : today())
  const [editing, setEditing] = useState(false),
    [query, setQuery] = useState('')
  const entries = Object.entries(records)
    .filter(
      ([key, value]) =>
        key.startsWith('diary/') &&
        !value.deletedAt &&
        (text(value.title) + ' ' + text(value.content)).includes(query),
    )
    .sort(([a], [b]) => b.localeCompare(a))
  const current = records['diary/' + date]
  return (
    <section className="diary-page">
      <p className="eyebrow">纸页之间，都是你的日子</p>
      <h1>日记</h1>
      <div className="toolbar">
        <input
          aria-label="日记日期"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
        <button className="primary" onClick={() => setEditing(true)}>
          写这一天
        </button>
      </div>
      <label>
        在日记里找找
        <input
          aria-label="筛选日记"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="标题或留下的话…"
        />
      </label>
      {!entries.length && <p className="empty">这里还留着空白。</p>}
      {entries.map(([key, value]) => (
        <article className="journal-entry" key={key}>
          <small>{text(value.date)}</small>
          <h2>{text(value.title) || '无题的一天'}</h2>
          <p className="diary-body">{text(value.content)}</p>
          <div className="toolbar">
            <button
              className="text-button"
              onClick={() => {
                setDate(text(value.date))
                setEditing(true)
              }}
            >
              接着写
            </button>
            <button
              className="text-button"
              onClick={() => {
                if (confirm('移除这篇日记？删除会同步到其他设备，已有备份仍保留。'))
                  void action(() => update(key, null))
              }}
            >
              移除
            </button>
          </div>
        </article>
      ))}
      {editing && (
        <RecordForm
          key={date}
          collection="diary"
          records={records}
          recordKey={current ? 'diary/' + date : undefined}
          initialDate={date}
          close={() => setEditing(false)}
        />
      )}
    </section>
  )
}
