import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSeedLibrary, normalizeLibrary } from '../domain/seed'
import { normalizeIdeas } from '../domain/ideas/normalization'
import { parseIdeaFrame } from '../domain/ideas/validation'
import { AppLibraryRepository } from '../infrastructure/libraryRepository'
import { ideaFixture } from '../modules/ideas/fixtures'
import { searchApplication } from '../modules/search/applicationSearch'
import { useLibraryStore } from './useLibraryStore'
vi.mock('../infrastructure/libraryRepository', async original => ({ ...await original<typeof import('../infrastructure/libraryRepository')>(), libraryRepository: { save: vi.fn(async () => {}) } }))
const store = () => useLibraryStore.getState()
const session = (id: string) => store().data.ideas!.sessions.find(item => item.id === id)!
function round(id: string, text = '我想继续想想', collect = false) { const revision = store().prepareIdeaRound(id, text, collect ? 'collect' : 'explore'); expect(store().completeIdeaRound(id, revision, ideaFixture)).toBe(true) }
describe('idea sessions and persistence', () => {
  beforeEach(() => { localStorage.clear(); useLibraryStore.setState({ data: createSeedLibrary() }) })
  it('migrates an old library and exposes a working navigation entry without replacing old contents', () => {
    const data = createSeedLibrary(); delete data.ideas
    data.settings.navigationOrder = data.settings.navigationOrder.filter(id => id !== 'ideas')
    data.settings.modules = data.settings.modules.filter(item => item.id !== 'ideas')
    const migrated = normalizeLibrary(data)
    expect(migrated.ideas).toEqual({ sessions: [], activeId: undefined }); expect(migrated.settings.navigationOrder).toContain('ideas')
    expect(migrated.works).toEqual(data.works.map(work => ({ ...work, volumeIds: work.volumeIds ?? [] })))
  })
  it('preserves original words, pending input and the user-edited manuscript across model rounds', () => {
    const id = store().createIdea('我为什么总是忙而不充实？'); round(id)
    store().editIdeaDraft(id, '我自己修改过的判断。'); round(id, '可能是任务太碎了')
    expect(session(id).draft).toBe('我自己修改过的判断。'); expect(session(id).turns[1].frame.manuscript).toBe(ideaFixture.manuscript)
    expect(session(id).seed).toBe('我为什么总是忙而不充实？')
    store().adoptIdeaDraft(id, ideaFixture.manuscript)
    expect(session(id).draftVersions).toContain('我自己修改过的判断。')
  })
  it('forks from an earlier question without deleting either branch or applying stale replies', () => {
    const id = store().createIdea('一个模糊念头'); round(id); round(id, '先往这个方向想')
    const revision = store().prepareIdeaRound(id, '尚未完成的输入', 'explore')
    const fork = store().forkIdea(id, 0)
    expect(session(id).turns).toHaveLength(2); expect(session(fork)).toMatchObject({ forkOf: id, draft: ideaFixture.manuscript })
    expect(session(fork).turns).toHaveLength(1)
    store().editIdeaDraft(id, '原分支发生了变化')
    expect(store().completeIdeaRound(id, revision, ideaFixture)).toBe(false)
    expect(session(id).pending?.input).toBe('尚未完成的输入')
  })
  it('collects, resumes, hides the module and restores a trashed session safely', () => {
    const id = store().createIdea('模糊念头'); round(id, '先整理', true)
    expect(session(id).status).toBe('collected'); round(id); expect(session(id).status).toBe('exploring')
    store().navigate('ideas'); store().toggleModule('ideas')
    expect(store().data.session.activeView).toBe('home'); expect(session(id).turns).toHaveLength(2)
    expect(searchApplication(store().data, '模糊念头')).not.toContainEqual(expect.objectContaining({ view: 'ideas' }))
    store().toggleModule('ideas'); store().trashIdea(id, true)
    expect(store().data.ideas?.activeId).toBeUndefined(); expect(() => store().prepareIdeaRound(id, '不能继续', 'explore')).toThrow()
    store().trashIdea(id, false); store().selectIdea(id); expect(session(id).turns).toHaveLength(2)
    expect(searchApplication(store().data, '模糊念头')).toContainEqual(expect.objectContaining({ view: 'ideas', targetId: id }))
  })
  it('round trips through the real repository and retains interrupted pending input', async () => {
    const id = store().createIdea('尚未成形的判断'); round(id)
    store().prepareIdeaRound(id, '停在这里，下次继续', 'collect')
    const repository = new AppLibraryRepository(); await repository.save(store().data)
    const restored = normalizeLibrary((await repository.load())!)
    expect(restored.ideas?.sessions[0]).toMatchObject({ seed: '尚未成形的判断', pending: { input: '停在这里，下次继续', mode: 'collect' } })
    expect(restored.ideas?.sessions[0].turns[0].frame).toEqual(ideaFixture)
  })
  it('rejects malformed model envelopes and recovers valid sessions from damaged optional data', () => {
    for (const raw of [null, 'broken', { ...ideaFixture, options: ['重复', '重复'] }, { ...ideaFixture, question: '' }, { ...ideaFixture, extra: 'unexpected' }]) expect(parseIdeaFrame(raw)).toBeUndefined()
    const id = store().createIdea('一份好稿'); round(id)
    const data = normalizeIdeas({ sessions: [null, session(id), session(id), { id: 'bad' }] })
    expect(data.sessions).toHaveLength(1)
    expect(normalizeIdeas(undefined)).toEqual({ sessions: [], activeId: undefined })
    expect(() => store().createIdea(' '.repeat(10))).toThrow()
  })
})
