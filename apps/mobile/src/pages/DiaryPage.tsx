import { useState } from 'react'
import type { Records } from '@yiyu/sync'
import { ChevronLeft, ChevronRight, Feather } from 'lucide-react'
import { RecordForm } from '../components/RecordForm'
import { today, text } from '../data'
import { update } from '../repository'
import { formatLocalDate } from '../../../desktop/src/domain/localDate'
import type { Action } from './HomePage'

export function DiaryPage({ records, target, action }: { records: Records; target?: string; action: Action }) {
  const [date, setDate] = useState(target?.startsWith('diary/') ? target.slice(6) : today())
  const [editing, setEditing] = useState(false), [query, setQuery] = useState('')
  const entries = Object.entries(records).filter(([key, value]) => key.startsWith('diary/') && !value.deletedAt && (text(value.title) + ' ' + text(value.content)).includes(query)).sort(([a], [b]) => b.localeCompare(a))
  const current = records['diary/' + date]?.deletedAt ? undefined : records['diary/' + date]
  const shift = (offset: number) => {
    const next = new Date(`${date}T12:00:00`)
    next.setDate(next.getDate() + offset)
    setDate(formatLocalDate(next))
  }
  return <section className="diary-page folio-diary">
    <p className="eyebrow">一日一页 · 不必写得完整</p><h1>日子，有迹可循。</h1>
    <div className="diary-date-turner">
      <button className="icon-button" aria-label="前一天日记" onClick={() => shift(-1)}><ChevronLeft size={22}/></button>
      <label><span>翻到这一天</span><input aria-label="日记日期" type="date" value={date} onChange={event => { if (event.target.value) setDate(event.target.value) }}/></label>
      <button className="icon-button" aria-label="后一天日记" onClick={() => shift(1)}><ChevronRight size={22}/></button>
    </div>
    <div className="diary-reading-layout">
      <article className="diary-open-page" aria-label={`${date}的日记`}>
        <header><time>{date.replaceAll('-', ' · ')}</time><button className="text-button" onClick={() => setEditing(true)}><Feather size={15}/>{current ? '接着写' : '写这一天'}</button></header>
        <h2>{text(current?.title) || (current ? '无题的一天' : '这一页，还留着空白。')}</h2>
        <p className={'diary-body' + (!current ? ' blank-page' : '')}>{text(current?.content) || (current ? '还没有正文，接着写几笔吧。' : '不必从头讲起，记住此刻想留下的就好。')}</p>
        <footer><span>— {date.slice(5).replace('-', ' / ')} —</span>{current && <button className="text-button" onClick={() => { if (confirm('移除这篇日记？删除会同步到其他设备，已有备份仍保留。')) void action(() => update('diary/' + date, null)) }}>移除这一页</button>}</footer>
      </article>
      <aside className="diary-date-index" aria-label="日记索引">
        <header><h2>翻过的日子</h2><button className="text-button" onClick={() => setDate(today())}>今天</button></header>
        <input aria-label="筛选日记" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="在留下的字里找找…"/>
        <div className="diary-date-strip">{entries.map(([key, value]) => <button aria-pressed={key === 'diary/' + date} key={key} onClick={() => setDate(key.slice(6))}><time>{key.slice(6).replaceAll('-', ' / ')}</time><span>{text(value.title) || '无题'}</span></button>)}</div>
        {!entries.length && <p className="footnote">{query ? '没有找到这样的字句，试试别的词。' : '写下第一篇，这里就有了来处。'}</p>}
      </aside>
    </div>
    {editing && <RecordForm key={date} collection="diary" records={records} recordKey={current ? 'diary/' + date : undefined} initialDate={date} close={() => setEditing(false)}/>}
  </section>
}
