import { useEffect, useState } from 'react'
import { useLibraryStore } from '../../state/useLibraryStore'
import { RecordsView } from './RecordsView'
import { TimelineView } from './TimelineView'
import type { RecordFilter, UsageFilter } from './recordUsage'
import './recordsHub.css'

export function RecordsHub() {
  const data = useLibraryStore(store => store.data)
  const initial = data.session.activeView === 'timeline' ? 'timeline' : data.session.activeView === 'places' ? 'places' : 'people'
  const [tab, setTab] = useState<'people' | 'places' | 'timeline'>(initial)
  const [filter, setFilter] = useState<RecordFilter>({ usage: 'all', workId: '' })
  useEffect(() => {
    const record = data.session.activeRecord
    if (record) {
      setTab(record.type === 'event' ? 'timeline' : record.type === 'place' ? 'places' : 'people')
      setFilter({ usage: 'all', workId: '' })
    }
  }, [data.session.activeRecord])
  useEffect(() => { setTab(initial) }, [initial])
  return <section className="records-hub">
    <header className="records-hub-bar">
      <div><strong>资料</strong><small>现实记忆与故事设定，各有位置。</small></div>
      <nav aria-label="资料类别">{(['people', 'places', 'timeline'] as const).map(value => <button type="button" className={tab === value ? 'active' : ''} aria-pressed={tab === value} key={value} onClick={() => setTab(value)}>{value === 'people' ? '人物' : value === 'places' ? '地点' : '时间线'}</button>)}</nav>
      <label>用途<select aria-label="筛选资料用途" value={filter.usage} onChange={event => setFilter({ ...filter, usage: event.target.value as UsageFilter })}><option value="all">全部</option><option value="real">现实记录</option><option value="fiction">作品设定</option><option value="unclassified">未分类</option></select></label>
      <label>作品<select aria-label="筛选资料作品" value={filter.workId} onChange={event => setFilter({ ...filter, workId: event.target.value })}><option value="">全部作品</option>{data.works.filter(work => !work.deletedAt).map(work => <option value={work.id} key={work.id}>{work.title}</option>)}</select></label>
    </header>
    {tab === 'timeline' ? <TimelineView filter={filter} /> : <RecordsView type={tab} filter={filter} />}
  </section>
}
