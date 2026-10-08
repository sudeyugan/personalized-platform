import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { createSeedLibrary } from '../../domain/seed'
import { useLibraryStore } from '../../state/useLibraryStore'
import { experienceCovers } from '../../infrastructure/experienceCovers'
import { ModuleSettings } from './ModuleSettings'

vi.mock('../../infrastructure/experienceCovers', async importOriginal => {
  const actual = await importOriginal<typeof import('../../infrastructure/experienceCovers')>()
  return { ...actual, experienceCovers: { ...actual.experienceCovers, hasKey: vi.fn().mockResolvedValue(false) } }
})
beforeEach(() => { vi.clearAllMocks(); useLibraryStore.setState({ data: createSeedLibrary() }) })
it('offers cover configuration in module settings without requiring a prior visit to experiences', async () => {
  render(<ModuleSettings />)
  expect(screen.getByRole('heading', { name: '经历册' })).toBeInTheDocument()
  expect(screen.getByText('封面来源设置 · 可选')).toBeInTheDocument()
  expect(screen.getByLabelText('微信读书 API Key')).toHaveAttribute('type', 'password')
  expect(screen.getByLabelText('TMDB API Read Access Token')).toHaveAttribute('type', 'password')
  expect(screen.getByAltText('The Movie Database')).toBeInTheDocument()
  await waitFor(() => {
    expect(experienceCovers.hasKey).toHaveBeenCalledWith('weread')
    expect(experienceCovers.hasKey).toHaveBeenCalledWith('tmdb')
  })
})
