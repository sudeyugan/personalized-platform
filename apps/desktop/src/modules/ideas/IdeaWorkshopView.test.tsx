import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSeedLibrary } from '../../domain/seed'
import { useLibraryStore } from '../../state/useLibraryStore'
import { IdeaWorkshopView } from './IdeaWorkshopView'
import { ideaFixture } from './fixtures'
import type { IdeaRequest } from './service'
vi.mock('../../infrastructure/libraryRepository', () => ({ libraryRepository: { save: vi.fn(async () => {}) } }))
describe('ink manuscript interaction', () => {
  beforeEach(() => {
    const data = createSeedLibrary(); data.session.activeView = 'ideas'; data.companion.provider.providerId = 'deepseek'
    useLibraryStore.setState({ data, saveStatus: 'saved' })
  })
  afterEach(cleanup)
  it('starts without aborting the first request, accepts options and free text, and collects a draft', async () => {
    const generate = vi.fn(async (_request: IdeaRequest) => ideaFixture)
    render(<IdeaWorkshopView generate={generate} />)
    fireEvent.change(screen.getByLabelText('写下最初的念头'), { target: { value: '我很忙，却不充实' } })
    fireEvent.click(screen.getByRole('button', { name: /从这一念开始/ }))
    await screen.findByRole('heading', { name: ideaFixture.question })
    expect(generate.mock.calls[0][0].signal.aborted).toBe(false)
    expect(screen.getByLabelText('编辑我的手稿')).toHaveValue(ideaFixture.manuscript)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(ideaFixture.options[1]) }))
    await waitFor(() => expect(useLibraryStore.getState().data.ideas?.sessions[0].turns).toHaveLength(2))
    fireEvent.change(screen.getByLabelText('也可以用自己的话，补上另一种可能'), { target: { value: '其实是我不清楚什么对我重要' } })
    fireEvent.click(screen.getByRole('button', { name: /继续推敲/ }))
    await waitFor(() => expect(useLibraryStore.getState().data.ideas?.sessions[0].turns).toHaveLength(3))
    expect(useLibraryStore.getState().data.ideas?.sessions[0].turns[2].input).toBe('其实是我不清楚什么对我重要')
    fireEvent.click(screen.getByRole('button', { name: /先整理到这里/ }))
    await screen.findByRole('heading', { name: '先把这份想法，留在纸上。' })
    expect(useLibraryStore.getState().data.ideas?.sessions[0].status).toBe('collected')
    fireEvent.click(screen.getByRole('button', { name: /回看与改选/ }))
    fireEvent.click(screen.getAllByRole('button', { name: '从这里另开一条思路' })[0])
    await waitFor(() => expect(useLibraryStore.getState().data.ideas?.sessions).toHaveLength(2))
    expect(useLibraryStore.getState().data.ideas?.sessions[1].turns).toHaveLength(4)
  })
  it('saves edited text before leaving, retains a failed turn and can retry it', async () => {
    const state = useLibraryStore.getState(), id = state.createIdea('先有一点想法'), revision = state.prepareIdeaRound(id, '起点', 'explore')
    state.completeIdeaRound(id, revision, ideaFixture)
    const generate = vi.fn(async () => { throw new Error('暂时连接不到模型') })
    render(<IdeaWorkshopView generate={generate} />)
    fireEvent.change(screen.getByLabelText('编辑我的手稿'), { target: { value: '我自己的表达' } })
    fireEvent.blur(screen.getByLabelText('编辑我的手稿'))
    expect(useLibraryStore.getState().data.ideas?.sessions[0].draft).toBe('我自己的表达')
    fireEvent.click(screen.getByRole('button', { name: new RegExp(ideaFixture.options[0]) }))
    await screen.findByRole('alert')
    expect(screen.getByRole('alert')).toHaveTextContent('暂时连接不到模型')
    expect(screen.getByLabelText('编辑我的手稿')).toHaveValue('我自己的表达')
    expect(screen.getByRole('button', { name: /继续这一轮/ })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: /继续这一轮/ }))
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByRole('button', { name: '写下新的想法' }))
    await screen.findByLabelText('写下最初的念头')
    expect(useLibraryStore.getState().data.ideas?.sessions[0].draft).toBe('我自己的表达')
  })
  it('can pause a pending request and never applies its late frame', async () => {
    let resolve!: (frame: typeof ideaFixture) => void
    const generate = vi.fn(() => new Promise<typeof ideaFixture>(done => { resolve = done }))
    render(<IdeaWorkshopView generate={generate} />)
    fireEvent.change(screen.getByLabelText('写下最初的念头'), { target: { value: '暂停看看' } })
    fireEvent.click(screen.getByRole('button', { name: /从这一念开始/ }))
    await screen.findByRole('button', { name: '暂停' })
    fireEvent.click(screen.getByRole('button', { name: '暂停' }))
    await act(async () => resolve(ideaFixture))
    expect(useLibraryStore.getState().data.ideas?.sessions[0].turns).toHaveLength(0)
    expect(screen.getByRole('button', { name: /继续这一轮/ })).toBeEnabled()
  })
  it('uses the existing privacy review UI and does not write a turn after the user declines', async () => {
    const generate = vi.fn(async (request: IdeaRequest) => {
      const allowed = await request.requestReview({ destination: '虚构模型', purpose: '本份想法', findingCounts: { email: 1 }, sanitizedPreview: '我的邮箱 [EMAIL_1]' })
      if (!allowed) throw new Error('已取消发送，手稿没有改变。')
      return ideaFixture
    })
    render(<IdeaWorkshopView generate={generate} />)
    fireEvent.change(screen.getByLabelText('写下最初的念头'), { target: { value: '一点想法' } })
    fireEvent.click(screen.getByRole('button', { name: /从这一念开始/ }))
    await screen.findByRole('alertdialog', { name: '发送前保护' })
    fireEvent.click(screen.getByRole('button', { name: '取消发送' }))
    await screen.findByRole('alert')
    expect(useLibraryStore.getState().data.ideas?.sessions[0].turns).toHaveLength(0)
    expect(screen.getByRole('button', { name: /继续这一轮/ })).toBeEnabled()
  })
})
