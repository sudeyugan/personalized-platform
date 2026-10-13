import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSeedLibrary } from '../../domain/seed'
import { emptyExperiences } from '../../domain/experiences'
import { libraryRepository } from '../../infrastructure/libraryRepository'
import { useLibraryStore } from '../../state/useLibraryStore'
import { ExperienceEditor } from './ExperienceEditor'
import { readExperienceRecovery, saveExperienceRecovery, setExperienceRecovery } from './experienceDraftRecovery'

vi.mock('../../infrastructure/libraryRepository', () => ({ libraryRepository: { save: vi.fn().mockResolvedValue(undefined) } }))
vi.mock('./CoverPicker', () => ({ CoverPicker: () => null }))
vi.mock('./ExperienceArtwork', () => ({ ExperienceArtwork: () => null }))
let count = 0
let scope: string
beforeEach(() => {
  localStorage.clear(); vi.mocked(libraryRepository.save).mockResolvedValue(undefined)
  scope = `draft-test-${++count}`
  useLibraryStore.setState({ data: createSeedLibrary(), health: { runtime: 'browser', storage: 'ready', libraryPath: scope } })
})
const editor = (onClose = vi.fn()) => render(<ExperienceEditor place={false} labels={emptyExperiences().tierLabels} onClose={onClose} />)
describe('draft recovery is explicit and does not create formal records', () => {
  it('allows explicit clearing and re-enabling after a corrupt recovery file, with no automatic deletion', () => {
    setExperienceRecovery(scope, true)
    const key = localStorage.key(0)!; localStorage.setItem(key, '{broken')
    editor()
    expect(localStorage.getItem(key)).toBe('{broken')
    fireEvent.click(screen.getByRole('button', { name: '清除损坏的本机草稿' }))
    expect(localStorage.getItem(key)).toBeNull()
    fireEvent.click(screen.getByLabelText('退出后保留文字草稿 · 可选'))
    expect(screen.getByLabelText('退出后保留文字草稿 · 可选')).toBeChecked()
  })
  it('defaults off and opt-in keeps current text locally without saving an experience', () => {
    editor()
    expect(screen.getByLabelText('退出后保留文字草稿 · 可选')).not.toBeChecked()
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '草稿作品' } })
    expect(readExperienceRecovery(scope).drafts).toEqual([])
    fireEvent.click(screen.getByLabelText('退出后保留文字草稿 · 可选'))
    expect(readExperienceRecovery(scope).drafts[0].draft.title).toBe('草稿作品')
    expect(useLibraryStore.getState().data.experiences?.entries ?? []).toEqual([])
    fireEvent.click(screen.getByLabelText('退出后保留文字草稿 · 可选'))
    expect(readExperienceRecovery(scope).drafts).toEqual([])
  })
  it('offers restore/discard first; restoring text warns that the image must be selected again', () => {
    setExperienceRecovery(scope, true)
    saveExperienceRecovery(scope, { key: 'new-work', draft: { title: '旧文字草稿', category: 'novel', creator: '', dateText: '', note: '感想', paperStyle: 'linen' }, updatedAt: '', coverNeedsReselect: true })
    editor()
    expect(screen.getByLabelText('名称')).toHaveValue('')
    expect(screen.getByLabelText('名称')).toBeDisabled()
    expect(screen.getByRole('button', { name: '保存这一页' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '恢复文字草稿' }))
    expect(screen.getByLabelText('名称')).toHaveValue('旧文字草稿')
    expect(screen.getByLabelText('名称')).not.toBeDisabled()
    expect(screen.getByText('文字已恢复，未保存的封面请重新选择。')).toBeInTheDocument()
    expect(useLibraryStore.getState().data.experiences?.entries ?? []).toEqual([])
  })
  it('keeps the draft after disk failure and retries without duplicating a newly created card', async () => {
    setExperienceRecovery(scope, true)
    const onClose = vi.fn(); editor(onClose)
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '可重试的作品' } })
    vi.mocked(libraryRepository.save).mockRejectedValue(new Error('磁盘保存失败'))
    fireEvent.click(screen.getByRole('button', { name: '保存这一页' }))
    expect(await screen.findByText('磁盘保存失败')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(readExperienceRecovery(scope).drafts).toHaveLength(1)
    vi.mocked(libraryRepository.save).mockResolvedValue(undefined)
    fireEvent.click(screen.getByRole('button', { name: '保存这一页' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(useLibraryStore.getState().data.experiences?.entries).toHaveLength(1)
    expect(readExperienceRecovery(scope).drafts).toEqual([])
  })
})
