import { describe, expect, it } from 'vitest'
import { createSeedLibrary } from '../../domain/seed'
import { searchApplication } from './applicationSearch'

describe('local whole application search', () => {
  it('finds content across chapters, diary, experiences, todo, people and music with destinations', () => {
    const data = createSeedLibrary(), chapter = Object.values(data.chapters)[0]
    chapter.plainText = '唯一线索在正文深处'; chapter.title = '章节'
    data.planner.diaryEntries = [{ date: '2026-10-09', title: '日记', content: '唯一线索', updatedAt: '' }]
    data.experiences = { tierLabels: { top: '', great: '', good: '', ordinary: '', poor: '' }, entries: [{ id: 'experience', title: '作品', category: 'anime', creator: '', dateText: '', note: '唯一线索', paperStyle: 'linen', order: 0, createdAt: '', updatedAt: '' }] }
    data.planner.todos = [{ id: 'todo', title: '唯一线索', note: '', priority: 'low', completed: false, createdAt: '' }]
    data.people[0].aliases = ['唯一线索']
    data.tracks = [{ id: 'track', title: '音乐', artist: '唯一线索', fileName: 'music.mp3', mimeType: 'audio/mpeg', size: 1, sha256: '', createdAt: '' }]
    data.settings.modules.find(item => item.id === 'music')!.enabled = true
    const hits = searchApplication(data, '唯一线索')
    expect(new Set(hits.map(hit => hit.group))).toEqual(new Set(['章节', '日记', '经历作品', '待办', '人物', '音乐']))
    expect(hits.find(hit => hit.group === '日记')).toMatchObject({ destination: 'diary.day', date: '2026-10-09' })
    expect(hits.find(hit => hit.group === '经历作品')).toMatchObject({ destination: 'experiences', targetId: 'experience' })
  })
  it('excludes locked/deleted work content, deleted records, disabled modules and secrets', () => {
    const data = createSeedLibrary(), work = data.works[0], chapter = Object.values(data.chapters)[0]
    chapter.plainText = '秘密内容'; work.locked = true; data.people[0].name = '秘密内容'; data.people[0].workId = work.id
    data.settings.trust.privateDictionary = [{ id: 'private', value: '秘密内容', category: 'account', enabled: true }]
    expect(searchApplication(data, '秘密内容')).toEqual([])
    work.locked = false; chapter.deletedAt = 'today'; data.people[0].deletedAt = 'today'
    expect(searchApplication(data, '秘密内容')).toEqual([])
    chapter.deletedAt = undefined; data.settings.modules.find(item => item.id === 'writing')!.enabled = false
    expect(searchApplication(data, '秘密内容')).toEqual([])
    expect(searchApplication(data, '设置').some(hit => hit.view === 'settings')).toBe(true)
  })
  it('matches whitespace-separated words and bounds each category without mutating data', () => {
    const data = createSeedLibrary(); const snapshot = JSON.stringify(data)
    expect(searchApplication(data, '   ')).toEqual([])
    searchApplication(data, '一 隅')
    expect(JSON.stringify(data)).toBe(snapshot)
    data.planner.diaryEntries = Array.from({ length: 30 }, (_, i) => ({ date: `2026-10-${i + 1}`, title: '匹配', content: '', updatedAt: '' }))
    expect(searchApplication(data, '匹配')).toHaveLength(8)
  })
})
