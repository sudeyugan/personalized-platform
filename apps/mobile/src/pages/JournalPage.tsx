import { useState } from 'react'
import { ArrowUpRight, Feather, Sparkles } from 'lucide-react'
import type { Records } from '@yiyu/sync'
import { today, text } from '../data'
import { RecordForm } from '../components/RecordForm'
import { moodOptions } from '../../../desktop/src/modules/mood/moodConfig'
export function JournalPage({
  records,
  go,
}: {
  records: Records
  go(page: string, key?: string): void
}) {
  const [date, setDate] = useState(today()),
    [editing, setEditing] = useState(false)
  const diary = records['diary/' + date]
  const moods = Object.entries(records).filter(
    ([key, value]) => key.startsWith('moods/') && value.date === date && !value.deletedAt,
  )
  return (
    <section className="journal-page">
      <p className="eyebrow">手记 · 留下与回望</p>
      <h1>把片刻，慢慢留下。</h1>
      <div className="journal-date">
        <label>
          翻到这一天
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <button className="text-button" onClick={() => setDate(today())}>
          回到今天
        </button>
      </div>
      <article className="journal-entry">
        <div className="section-heading">
          <small>{date} ／ 日记</small>
          <button className="text-button" onClick={() => setEditing(true)}>
            <Feather size={15} />
            {diary ? '接着写' : '写日记'}
          </button>
        </div>
        <h2>{text(diary?.title) || (diary ? '无题的一天' : '今天，还留着空白。')}</h2>
        <p className="journal-excerpt">
          {text(diary?.content) || '不必写得完整，留下此刻想记住的也好。'}
        </p>
        <button
          className="text-button"
          onClick={() => go('diary', diary ? 'diary/' + date : undefined)}
        >
          展开日记册 <ArrowUpRight size={15} />
        </button>
      </article>
      <article className="journal-entry">
        <div className="section-heading">
          <h2>这一天的心情</h2>
          <button className="text-button" onClick={() => go('moods', 'moods/' + date + '-morning')}>
            记下五点 ＋
          </button>
        </div>
        {moods.length ? (
          moods.map(([key, value]) => (
            <div className="journal-mood-row" key={key}>
              <small>
                {value.period === 'morning'
                  ? '早晨'
                  : value.period === 'afternoon'
                    ? '午后'
                    : '晚上'}
              </small>
              <div>
                {Object.entries(value.points as Record<string, number>)
                  .filter(([, points]) => points > 0)
                  .map(([id, points]) => (
                    <span key={id}>
                      {moodOptions.find((mood) => mood.id === id)?.label ?? id} {points}
                    </span>
                  ))}
              </div>
            </div>
          ))
        ) : (
          <p className="muted">这一天还没有记录。不猜测，也不补零。</p>
        )}
        <button className="text-button" onClick={() => go('moods', 'moods/' + date + '-morning')}>
          回望这一周 / 这个月 <ArrowUpRight size={15} />
        </button>
      </article>
      <button className="idea-entry" onClick={() => go('ideas')}>
        <span className="eyebrow">
          <Sparkles size={14} /> 想法工坊
        </span>
        <strong>从一个模糊念头开始。</strong>
        <span>展开一卷新的推敲 ↗</span>
      </button>
      {editing && (
        <RecordForm
          key={date}
          collection="diary"
          records={records}
          recordKey={diary ? 'diary/' + date : undefined}
          initialDate={date}
          close={() => setEditing(false)}
        />
      )}
    </section>
  )
}
