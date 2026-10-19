import { useState } from 'react'
import type { Records } from '@yiyu/sync'
import { categoryLabels, defaultTierLabels, tierIds } from '../../../desktop/src/domain/experiences'
import { today, text } from '../data'
import { modify, update } from '../repository'
import { RecordForm } from '../components/RecordForm'
import type { Action } from './HomePage'
const names: Record<string, string> = {
  diary: '日记',
  people: '人物',
  places: '地点',
  events: '时间线',
  experiences: '经历册',
  questions: '每日一问',
}
export function RecordsPage({
  collection,
  records,
  target,
  action,
}: {
  collection: string
  records: Records
  target?: string
  action: Action
}) {
  const [editing, setEditing] = useState<string | null | undefined>(() =>
    target && records[target] ? target : undefined,
  )
  const [date, setDate] = useState(today()),
    [ranked, setRanked] = useState(false),
    [query, setQuery] = useState('')
  const values = Object.entries(records)
    .filter(
      ([key, value]) =>
        key.startsWith(`${collection}/`) &&
        !value.deletedAt &&
        (!query ||
          `${text(value.title)} ${text(value.name)} ${text(value.note)} ${text(value.content)}`.includes(
            query,
          )),
    )
    .sort(([a, av], [b, bv]) =>
      collection === 'diary'
        ? b.localeCompare(a)
        : collection === 'events'
          ? text(av.sortTime ?? av.displayTime).localeCompare(text(bv.sortTime ?? bv.displayTime))
          : Number(av.order ?? 0) - Number(bv.order ?? 0),
    )
  const rank = (key: string, tier: string) =>
    action(() =>
      modify(key, (value) => {
        const next = { ...value, order: Date.now(), updatedAt: new Date().toISOString() }
        return tier
          ? { ...next, tier }
          : Object.fromEntries(Object.entries(next).filter(([field]) => field !== 'tier'))
      }),
    )
  const card = ([key, value]: [string, Record<string, unknown>]) => (
    <article className={`paper-card ${collection === 'experiences' ? 'experience-card' : ''}`} key={key}>
      <small>
        {collection === 'experiences'
          ? categoryLabels[value.category as keyof typeof categoryLabels]
          : collection === 'diary'
            ? text(value.date)
            : text(value.displayTime ?? value.region)}
      </small>
      <h3>{text(value.title) || text(value.name) || text(value.question) || '无题的一天'}</h3>
      {value.creator ? <small>{text(value.creator)}</small> : null}
      <p>{text(value.note ?? value.content ?? value.description ?? value.summary)}</p>
      <div className="toolbar">
        <button className="text-button" onClick={() => setEditing(key)}>
          展开{collection === 'diary' ? '手稿' : '编辑'}
        </button>
        <button
          className="text-button"
          onClick={() => {
            if (confirm('移除这份记录？删除会同步到其他设备，原有备份仍保留。'))
              void action(() => update(key, null))
          }}
        >
          移除
        </button>
      </div>
    </article>
  )
  return (
    <section>
      <p className="eyebrow">随身带着，随时续写</p>
      <header className="section-heading">
        <h1>{names[collection] ?? '资料'}</h1>
        <button className="primary" onClick={() => setEditing(null)}>
          ＋ 留一笔
        </button>
      </header>
      {collection === 'diary' && (
        <div className="toolbar">
          <input
            aria-label="日记日期"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
          <button onClick={() => setEditing(records[`diary/${date}`] ? `diary/${date}` : null)}>
            写这一天
          </button>
        </div>
      )}
      <input
        aria-label="筛选记录"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="在这一册里找找…"
      />
      {collection === 'experiences' && (
        <div className="segments">
          <button aria-pressed={!ranked} onClick={() => setRanked(false)}>
            纸卡
          </button>
          <button aria-pressed={ranked} onClick={() => setRanked(true)}>
            从夯到拉
          </button>
        </div>
      )}
      {!values.length && (
        <p className="empty">
          这里还留着空白。
          <br />
          <small>可以先记下，也可以从电脑同步带来。</small>
        </p>
      )}
      {ranked ? (
        <div className="rank-board">
          {[...tierIds, ''].map((tier) => (
            <section className="rank-lane" data-tier={tier} key={tier}>
              <h3>{tier ? defaultTierLabels[tier as keyof typeof defaultTierLabels] : '还没排'}</h3>
              <div>
                {values
                  .filter(([, value]) => (value.tier ?? '') === tier)
                  .map(([key, value]) => (
                    <div className="rank-item" key={key}>
                      <button
                        className="rank-handle"
                        aria-label={`拖动${text(value.title)}`}
                        onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
                        onPointerMove={(event) => {
                          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
                          event.currentTarget.classList.add('dragging')
                        }}
                        onPointerUp={(event) => {
                          const lane = document
                            .elementFromPoint(event.clientX, event.clientY)
                            ?.closest<HTMLElement>('[data-tier]')
                          event.currentTarget.classList.remove('dragging')
                          event.currentTarget.releasePointerCapture(event.pointerId)
                          if (lane) void rank(key, lane.dataset.tier ?? '')
                        }}
                        onPointerCancel={(event) => event.currentTarget.classList.remove('dragging')}
                      >
                        {text(value.title)}
                      </button>
                      <select
                        aria-label={`移动${text(value.title)}到`}
                        value={tier}
                        onChange={(event) => void rank(key, event.target.value)}
                      >
                        {[...tierIds, ''].map((id) => (
                          <option key={id} value={id}>
                            {id ? defaultTierLabels[id as keyof typeof defaultTierLabels] : '还没排'}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="record-list">{values.map(card)}</div>
      )}
      {editing !== undefined && (
        <RecordForm
          collection={collection}
          records={records}
          recordKey={editing ?? undefined}
          initialDate={date}
          close={() => setEditing(undefined)}
        />
      )}
    </section>
  )
}
