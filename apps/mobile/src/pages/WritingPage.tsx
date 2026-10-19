import { useState } from 'react'
import type { Records } from '@yiyu/sync'
import type { Chapter, Work } from '../../../desktop/src/domain/models'
import { rows } from '../data'
import { changeRecords } from '../repository'
import { ChapterEditor } from '../writing/ChapterEditor'
import { RecordForm } from '../components/RecordForm'
import type { Action } from './HomePage'
export default function WritingPage({
  records,
  target,
  action,
}: {
  records: Records
  target?: string
  action: Action
}) {
  const targetRecord = target ? records[target] : undefined
  const works = rows<Work>(records, 'works')
  const [workId, setWorkId] = useState(() =>
    target?.startsWith('works/') ? target.split('/')[1] : String(targetRecord?.workId ?? works[0]?.id ?? ''),
  )
  const [chapterId, setChapterId] = useState<string | undefined>(
    target?.startsWith('chapters/') ? target.split('/')[1] : undefined,
  )
  const [editingWork, setEditingWork] = useState<string | null | undefined>()
  const work = works.find((item) => item.id === workId)
  const chapters = rows<Chapter>(records, 'chapters')
    .filter((chapter) => chapter.workId === workId)
    .sort((a, b) => (work?.chapterIds.indexOf(a.id) ?? -1) - (work?.chapterIds.indexOf(b.id) ?? -1))
  const chapter = chapters.find((item) => item.id === chapterId)
  const createChapter = () =>
    action(() =>
      changeRecords((current) => {
        const value = current[`works/${workId}`]
        if (!value || value.deletedAt) throw new Error('作品已移走，未创建章节。')
        const id = crypto.randomUUID(),
          now = new Date().toISOString()
        const chapter = {
          id,
          workId,
          title: '未题的一章',
          content: { type: 'doc', content: [{ type: 'paragraph' }] },
          plainText: '',
          summary: '',
          wordCount: 0,
          revision: 0,
          status: 'draft',
          updatedAt: now,
        }
        setChapterId(id)
        return {
          ...current,
          [`chapters/${id}`]: chapter,
          [`works/${workId}`]: {
            ...value,
            chapterIds: [...(value.chapterIds as string[]), id],
            updatedAt: now,
          },
        }
      }),
    )
  return (
    <section>
      <p className="eyebrow">一页一页，把心里的世界写下来</p>
      <header className="section-heading">
        <h1>创作，随身。</h1>
        <button className="primary" onClick={() => setEditingWork(null)}>
          ＋ 作品
        </button>
      </header>
      <div className="work-shelf">
        {works.map((item) => (
          <button
            className="work-spine"
            key={item.id}
            aria-pressed={workId === item.id}
            onClick={() => setWorkId(item.id)}
          >
            <span>{item.kind === 'memoir' ? '回忆' : item.kind === 'novel' ? '小说' : '手稿'}</span>
            <strong>{item.title}</strong>
            <small>{item.chapterIds.length} 章</small>
          </button>
        ))}
      </div>
      {!works.length && (
        <p className="empty">
          从一份作品开始。
          <br />
          也可以连接电脑，接着已有的章节写。
        </p>
      )}
      {work && (
        <>
          <header className="section-heading">
            <div>
              <h2>{work.title}</h2>
              <p className="muted">{work.description}</p>
            </div>
            <div className="toolbar">
              <button className="text-button" onClick={() => setEditingWork(`works/${work.id}`)}>
                作品设置
              </button>
              <button onClick={() => void createChapter()}>＋ 章节</button>
            </div>
          </header>
          <div className="chapter-list">
            {chapters.map((chapter, i) => (
              <button
                className="chapter-card paper-card"
                key={chapter.id}
                onClick={() => setChapterId(chapter.id)}
              >
                <span className="chapter-number">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <h3>{chapter.title}</h3>
                  <p>{chapter.summary || chapter.plainText.slice(0, 100) || '留白，等下一笔。'}</p>
                  <small>
                    {chapter.wordCount} 字 · {new Date(chapter.updatedAt).toLocaleDateString()}
                  </small>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
      <p className="footnote">
        复用电脑富文本结构，不转成纯文本覆盖；未同步的附件显示占位，保留引用。加密作品不会出现在手机同步资料里。
      </p>
      {chapter && <ChapterEditor key={chapter.id} chapter={chapter} close={() => setChapterId(undefined)} />}
      {editingWork !== undefined && (
        <RecordForm
          collection="works"
          recordKey={editingWork ?? undefined}
          records={records}
          close={() => setEditingWork(undefined)}
        />
      )}
    </section>
  )
}
