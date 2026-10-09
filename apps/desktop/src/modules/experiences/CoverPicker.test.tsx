import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSeedLibrary } from '../../domain/seed'
import { experienceCovers } from '../../infrastructure/experienceCovers'
import { assetRepository } from '../../infrastructure/assetRepository'
import { useLibraryStore } from '../../state/useLibraryStore'
import { ExperiencesView } from './ExperiencesView'

vi.mock('../../infrastructure/libraryRepository', () => ({ libraryRepository: { save: vi.fn().mockResolvedValue(undefined) } }))
vi.mock('../../infrastructure/experienceCovers', async importOriginal => {
  const actual = await importOriginal<typeof import('../../infrastructure/experienceCovers')>()
  return { ...actual, experienceCovers: { ...actual.experienceCovers, search: vi.fn(), image: vi.fn() } }
})
describe('web novel cover adoption', () => {
  beforeEach(() => { useLibraryStore.setState({ data: createSeedLibrary() }) })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
  it('shows a downloaded cover and saves its local asset only after explicit adoption and Save', async () => {
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL() { return 'blob:cover-preview' }
      static revokeObjectURL() {}
    })
    const file = new File(['prepared image fixture'], '经历封面.webp', { type: 'image/webp' })
    const sourceUrl = 'https://www.qidian.com/book/1021671831/'
    vi.mocked(experienceCovers.search).mockResolvedValueOnce([{ id: 'qidian:1021671831', provider: 'webnovel', title: '我的女友是恶劣大小姐', matchedTitle: '我加载了恋爱游戏', creator: '掠过的乌鸦', year: '', coverUrl: 'https://qidian.qpic.cn/qdbimg/349573/1021671831/180', sourceUrl, credit: '起点官方封面' }])
    vi.mocked(experienceCovers.image).mockResolvedValueOnce(file)
    const importImage = vi.spyOn(assetRepository, 'importImage').mockResolvedValue({ id: 'asset-selected-cover', fileName: file.name, mimeType: file.type, size: file.size, sha256: 'fixture', width: 180, height: 240, chapterIds: [], purpose: 'experience', createdAt: '2026-10-08T00:00:00Z' })
    vi.spyOn(assetRepository, 'readUrl').mockResolvedValue('blob:saved-cover')
    render(<ExperiencesView />)
    fireEvent.click(screen.getByRole('button', { name: '收进一部作品' }))
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '我加载了恋爱游戏' } })
    fireEvent.change(screen.getByLabelText('留下的感想 · 可选'), { target: { value: '我的原感想' } })
    fireEvent.click(screen.getByRole('button', { name: '找封面' }))
    expect(await screen.findByRole('button', { name: '采用这张' })).toBeEnabled()
    expect(await screen.findByAltText('我的女友是恶劣大小姐封面')).toHaveAttribute('src', 'blob:cover-preview')
    expect(importImage).not.toHaveBeenCalled()
    expect(useLibraryStore.getState().data.experiences?.entries).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: '采用这张' }))
    expect(screen.getByLabelText('名称')).toHaveValue('我加载了恋爱游戏')
    expect(screen.getByLabelText('留下的感想 · 可选')).toHaveValue('我的原感想')
    expect(importImage).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '保存这一页' }))
    await waitFor(() => expect(useLibraryStore.getState().data.experiences?.entries[0]).toMatchObject({ title: '我加载了恋爱游戏', note: '我的原感想', coverAssetId: 'asset-selected-cover', source: { url: sourceUrl } }))
    expect(importImage).toHaveBeenCalledWith(file, { purpose: 'experience' })
    expect(useLibraryStore.getState().data.assets.some(asset => asset.id === 'asset-selected-cover')).toBe(true)
  })
})
