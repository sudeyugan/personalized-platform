import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { stableJson, type Records } from '@yiyu/sync'
import { supportedDocument } from '../../../../mobile/src/writing/document'
import { searchable, toggleTodo, todoVisible } from '../../../../mobile/src/data'
import { RecordForm } from '../../../../mobile/src/components/RecordForm'
import type { TodoItem } from '../../domain/models'
const repo = vi.hoisted(() => ({ records: {} as Records, editMode: vi.fn(), sync: vi.fn() }))
vi.mock('../../../../mobile/src/repository', () => ({
  holdEdits: () => {
    repo.editMode(true)
    return () => repo.editMode(false)
  },
  sync: repo.sync,
  modify: vi.fn(
    async (key: string, change: (current: Record<string, unknown>) => Record<string, unknown>) => {
      repo.records[key] = change(repo.records[key])
    },
  ),
  changeRecords: vi.fn(async (change: (current: Records) => Records) => {
    repo.records = change(repo.records)
  }),
}))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  repo.records = {}
})
const todo: TodoItem = {
  id: 'one',
  title: '散步',
  note: '',
  priority: 'medium',
  completed: false,
  createdAt: '2026-10-19T12:00:00',
}
describe('mobile uses PC domain rules rather than simplified booleans', () => {
  it('completes only the selected day of a repeating todo', () => {
    const result = toggleTodo({ ...todo, repeat: 'daily', completedDates: ['2026-10-18'] }, '2026-10-19')
    expect(result.completedDates).toEqual(['2026-10-18', '2026-10-19'])
    expect(result.completed).toBe(false)
    expect(toggleTodo(result, '2026-10-19').completedDates).toEqual(['2026-10-18'])
  })
  it('records quota increments and undoes only the latest completion', () => {
    const result = toggleTodo(
      { ...todo, repeat: 'quota', quotaPeriod: 'week', quotaTarget: 1 },
      '2026-10-19',
      new Date('2026-10-19T12:00:00'),
    )
    expect(result.quotaCompletions).toHaveLength(1)
    expect(toggleTodo(result, '2026-10-19').quotaCompletions).toEqual([])
  })
  it('filters the repeat schedule, searches all text collections and excludes deleted records', () => {
    expect(todoVisible({ ...todo, repeat: 'weekly', repeatDays: [2] }, '2026-10-19')).toBe(false)
    expect(todoVisible({ ...todo, repeat: 'weekly', repeatDays: [1] }, '2026-10-19')).toBe(true)
    expect(
      searchable(
        {
          'chapters/a': { title: '故事', plainText: '远山有回声' },
          'people/b': { name: '远山', deletedAt: 'now' },
        },
        '远山',
      ).map(([key]) => key),
    ).toEqual(['chapters/a'])
  })
})
describe('mobile document compatibility', () => {
  it('keeps PC annotations, references, image metadata and alignment supported', () => {
    expect(
      supportedDocument({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: { lineHeight: '2', textAlign: 'center' },
            content: [
              {
                type: 'text',
                text: '一笔',
                marks: [
                  {
                    type: 'entityReference',
                    attrs: { entityId: 'one', entityType: 'person', label: '人物' },
                  },
                  { type: 'authorAnnotation', attrs: { id: 'a', note: '批注', createdAt: 'now' } },
                ],
              },
            ],
          },
          {
            type: 'imageAsset',
            attrs: { assetId: 'asset-one', caption: '留在原设备', alt: '', width: 72, align: 'center' },
          },
        ],
      }),
    ).toBe(true)
  })
  it('fails closed on unknown nodes, marks and attributes rather than dropping them', () => {
    for (const doc of [
      { type: 'table' },
      { type: 'paragraph', attrs: { newSetting: 1 } },
      { type: 'text', text: '不丢', marks: [{ type: 'futureMark' }] },
    ])
      expect(supportedDocument(doc)).toBe(false)
  })
})
describe('mobile editors preserve PC fields', () => {
  it('edits an existing person without losing custom fields, aliases or work binding', async () => {
    const person = {
      id: 'p1',
      name: '原名字',
      summary: '印象',
      aliases: ['小名'],
      tags: ['旧友'],
      chapterIds: ['c1'],
      customFields: [{ id: 'f1', label: '爱好', value: '读书' }],
      importantExperiences: '经过',
      usage: 'fiction',
      workId: 'w1',
    }
    repo.records = { 'people/p1': person }
    render(
      <RecordForm collection="people" recordKey="people/p1" records={repo.records} close={() => undefined} />,
    )
    fireEvent.change(screen.getByLabelText('名字'), { target: { value: '新名字' } })
    fireEvent.click(screen.getByRole('button', { name: /^保存$/ }))
    await waitFor(() => expect(repo.records['people/p1'].name).toBe('新名字'))
    expect(repo.records['people/p1']).toEqual({ ...person, name: '新名字' })
  })
  it('does not overwrite a newer record while an editor is open', async () => {
    repo.records = {
      'diary/2026-10-19': { date: '2026-10-19', title: '原稿', content: '原句', updatedAt: 'then' },
    }
    render(
      <RecordForm
        collection="diary"
        recordKey="diary/2026-10-19"
        records={repo.records}
        close={() => undefined}
      />,
    )
    fireEvent.change(screen.getByLabelText('这一天'), { target: { value: '手机续写' } })
    repo.records = { 'diary/2026-10-19': { ...repo.records['diary/2026-10-19'], content: '更新的稿' } }
    fireEvent.click(screen.getByRole('button', { name: /^保存$/ }))
    await screen.findByText('这份记录刚有其他修改，请返回核对；没有覆盖它。')
    expect(repo.records['diary/2026-10-19'].content).toBe('更新的稿')
  })
  it('can clear a tier and keeps source attribution intact', async () => {
    const experience = {
      id: 'e1',
      title: '一本书',
      category: 'book',
      creator: '',
      note: '',
      dateText: '',
      tier: 'top',
      paperStyle: 'linen',
      order: 0,
      createdAt: 'then',
      updatedAt: 'then',
      source: { provider: 'openlibrary', url: 'https://example.org/', credit: '原来源' },
    }
    repo.records = { 'experiences/e1': experience }
    render(
      <RecordForm
        collection="experiences"
        recordKey="experiences/e1"
        records={repo.records}
        close={() => undefined}
      />,
    )
    fireEvent.change(screen.getByLabelText('偏爱程度'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /^保存$/ }))
    await waitFor(() => expect(Object.hasOwn(repo.records['experiences/e1'], 'tier')).toBe(false))
    expect(stableJson(repo.records['experiences/e1'].source)).toBe(stableJson(experience.source))
  })
})
