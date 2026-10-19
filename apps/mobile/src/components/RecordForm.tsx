import { useState } from 'react'
import { stableJson, type Records } from '@yiyu/sync'
import { dayNumber } from '../../../desktop/src/modules/planner/plannerDates'
import { today, text } from '../data'
import { changeRecords, modify } from '../repository'
import { Sheet } from './Sheet'
import { mobileRecordFields as fields, newMobileRecord as defaults } from './recordSchema'
export function RecordForm({
  collection,
  recordKey,
  records,
  close,
  initialDate,
}: {
  collection: string
  recordKey?: string
  records: Records
  close(): void
  initialDate?: string
}) {
  const [id] = useState(
    () =>
      recordKey?.split('/')[1] ?? (collection === 'diary' ? (initialDate ?? today()) : crypto.randomUUID()),
  )
  const key = recordKey ?? `${collection}/${id}`
  const original = records[key]
  const [initial] = useState(
    () =>
      original ?? {
        ...defaults(collection, id),
        ...(collection === 'calendar' && initialDate ? { date: initialDate } : {}),
      },
  )
  const [value, setValue] = useState(initial)
  const [repeat, setRepeat] = useState('weekly'),
    [day, setDay] = useState(String(dayNumber(today()))),
    [due, setDue] = useState(initialDate ?? today())
  const changed =
    JSON.stringify(value) !== JSON.stringify(initial) || (collection === 'assignments' && !original)
  const set = (field: string, next: unknown) => setValue((old) => ({ ...old, [field]: next }))
  const save = async () => {
    const next = { ...value }
    if (
      collection !== 'diary' &&
      !text(next.title ?? next.name ?? next.subject ?? next.question).trim() &&
      !text(next.subject).trim()
    )
      throw new Error('先写下名称，再留存这一页。')
    if (collection === 'courses') {
      next.day = Number(next.day)
      next.period = Number(next.period)
    }
    if (collection === 'calendar' && !text(next.date)) throw new Error('请选择日期。')
    if (collection === 'experiences') {
      if (!next.tier) delete next.tier
      next.updatedAt = new Date().toISOString()
    }
    if (collection === 'diary') next.updatedAt = new Date().toISOString()
    if (collection === 'works') next.updatedAt = new Date().toISOString()
    if (collection === 'todos') {
      if (!next.dueDate) delete next.dueDate
      if (next.repeat === 'weekly' && !Array.isArray(next.repeatDays))
        next.repeatDays = [dayNumber(text(next.dueDate) || today())]
      if (next.repeat === 'quota') {
        next.quotaPeriod ??= 'week'
        next.quotaTarget = Math.max(1, Math.min(99, Number(next.quotaTarget) || 3))
      }
    }
    if (collection === 'events' && text(next.startDate)) {
      next.sortTime = next.startDate
      next.precision = 'exact'
    }
    if (collection === 'assignments') {
      next.title = text(next.subject).trim()
      if (!original) {
        if (!due) throw new Error('请选择截止日期。')
        next.rules = [
          {
            id: crypto.randomUUID(),
            repeat,
            startDate: due,
            weekdays: repeat === 'weekly' ? [Number(day)] : [],
          },
        ]
      }
    }
    if (original)
      await modify(key, (current) => {
        if (stableJson(current) !== stableJson(original))
          throw new Error('这份记录刚有其他修改，请返回核对；没有覆盖它。')
        return next
      })
    else
      await changeRecords((current) => {
        if (current[key]) throw new Error('这份记录刚刚出现，请返回打开后再编辑。')
        return { ...current, [key]: next }
      })
  }
  return (
    <Sheet title={original ? '续写这一页' : '留下一笔'} dirty={changed} close={close} save={save}>
      {collection === 'diary' && <p className="eyebrow">{id.replaceAll('-', ' / ')}</p>}
      {fields[collection]?.map((field) => (
        <label key={field.key}>
          {field.label}
          {field.options ? (
            <select
              aria-label={field.label}
              value={String(value[field.key] ?? field.options[0][0])}
              onChange={(event) => set(field.key, event.target.value)}
            >
              {field.options.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          ) : field.type === 'textarea' ? (
            <textarea
              aria-label={field.label}
              className={collection === 'diary' ? 'diary-paper' : ''}
              value={text(value[field.key])}
              maxLength={30000}
              onChange={(event) => set(field.key, event.target.value)}
              placeholder="不必急着写完。"
            />
          ) : (
            <input
              aria-label={field.label}
              type={field.type ?? 'text'}
              value={text(value[field.key])}
              maxLength={field.key === 'title' || field.key === 'name' ? 160 : 500}
              onChange={(event) => set(field.key, event.target.value)}
            />
          )}
        </label>
      ))}
      {collection === 'todos' && value.repeat === 'weekly' && (
        <fieldset>
          <legend>每周哪几天</legend>
          <div className="segments weekdays">
            {Array.from({ length: 7 }, (_, i) => i + 1).map((day) => (
              <button
                type="button"
                aria-pressed={Array.isArray(value.repeatDays) && value.repeatDays.includes(day)}
                key={day}
                onClick={() => {
                  const current = Array.isArray(value.repeatDays) ? (value.repeatDays as number[]) : []
                  const next = current.includes(day)
                    ? current.filter((item) => item !== day)
                    : [...current, day]
                  set('repeatDays', next.length ? next : [day])
                }}
              >
                {'一二三四五六日'[day - 1]}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {collection === 'todos' && value.repeat === 'quota' && (
        <div className="form-row">
          <label>
            周期
            <select
              value={text(value.quotaPeriod) || 'week'}
              onChange={(event) => set('quotaPeriod', event.target.value)}
            >
              <option value="day">每天</option>
              <option value="week">每周</option>
              <option value="month">每月</option>
            </select>
          </label>
          <label>
            目标次数
            <input
              type="number"
              min={1}
              max={99}
              value={Number(value.quotaTarget ?? 3)}
              onChange={(event) => set('quotaTarget', Number(event.target.value))}
            />
          </label>
        </div>
      )}
      {collection === 'assignments' &&
        (!original ? (
          <>
            <div className="segments">
              <button aria-pressed={repeat === 'weekly'} onClick={() => setRepeat('weekly')}>
                每周交
              </button>
              <button aria-pressed={repeat === 'once'} onClick={() => setRepeat('once')}>
                指定日期
              </button>
            </div>
            {repeat === 'weekly' ? (
              <label>
                周几交
                <select value={day} onChange={(event) => setDay(event.target.value)}>
                  {Array.from({ length: 7 }, (_, i) => (
                    <option key={i} value={i + 1}>
                      周{'一二三四五六日'[i]}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                截止日期
                <input type="date" value={due} onChange={(event) => setDue(event.target.value)} />
              </label>
            )}
          </>
        ) : (
          <p className="footnote">原有周期、改期与提交历史保持不变；这里只改课程和备注。</p>
        ))}
      {['people', 'places', 'events'].includes(collection) && (
        <p className="footnote">已有作品归属、关联、别名与自定义字段会保留，不会因手机编辑而丢失。</p>
      )}
    </Sheet>
  )
}
