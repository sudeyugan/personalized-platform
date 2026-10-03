import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSeedLibrary } from '../../domain/seed'
import { backupRepository } from '../../infrastructure/backupRepository'
import { BackupSettingsSection } from './BackupSettingsSection'

const state = vi.hoisted(() => ({ setBackupSettings: vi.fn(), data: {} as ReturnType<typeof createSeedLibrary> }))
vi.mock('../../state/useLibraryStore', () => ({ useLibraryStore: () => state }))
vi.mock('../../infrastructure/backupRepository', () => ({ backupRepository: {
  list: vi.fn(), create: vi.fn(), previewSaved: vi.fn(), restoreSaved: vi.fn(), preview: vi.fn(), restore: vi.fn(),
} }))
const item = { path: 'D:/backups/one.yiyu-snapshot', createdAt: '2026-10-03T01:00:00Z', size: 1024, sha256: '', automatic: true, shared: true }
const preview = { appVersion: '2.0.0', createdAt: item.createdAt, works: 1, chapters: 2, assets: 3, encryptedVaults: 0, checksumsValid: true }

describe('BackupSettingsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.data = createSeedLibrary()
    state.data.settings.backup.directory = 'D:/backups'
    vi.mocked(backupRepository.list).mockResolvedValue([item])
    vi.mocked(backupRepository.previewSaved).mockResolvedValue(preview)
  })
  it('shows shared-directory portability guidance and configurable simple defaults', async () => {
    render(<BackupSettingsSection />)
    expect(await screen.findByText('自动快照')).toBeInTheDocument()
    expect(screen.getByLabelText('自动备份间隔')).toHaveValue(3)
    expect(screen.getByLabelText('自动备份保留数量')).toHaveValue(3)
    expect(screen.getByText(/迁移时请复制整个备份目录/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('自动备份间隔'), { target: { value: '5' } })
    expect(state.setBackupSettings).toHaveBeenCalledWith({ intervalDays: 5 })
  })
  it('previews saved snapshots through scoped file commands and respects restore cancellation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<BackupSettingsSection />)
    fireEvent.click(await screen.findByRole('button', { name: '预览恢复' }))
    expect(await screen.findByRole('button', { name: '确认恢复' })).toBeEnabled()
    expect(backupRepository.previewSaved).toHaveBeenCalledWith(item.path, 'D:/backups')
    fireEvent.click(screen.getByRole('button', { name: '确认恢复' }))
    expect(backupRepository.restoreSaved).not.toHaveBeenCalled()
    confirm.mockRestore()
  })
  it('shows native missing-media errors without offering restore', async () => {
    vi.mocked(backupRepository.previewSaved).mockRejectedValue('BACKUP_SHARED_MISSING:共享素材缺失')
    render(<BackupSettingsSection />)
    fireEvent.click(await screen.findByRole('button', { name: '预览恢复' }))
    expect(await screen.findByText('BACKUP_SHARED_MISSING:共享素材缺失')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认恢复' })).not.toBeInTheDocument()
  })
  it('blocks restoring a failed checksum and disables conflicting actions while validating', async () => {
    let finish!: (value: typeof preview) => void
    vi.mocked(backupRepository.previewSaved).mockReturnValue(new Promise((resolve) => { finish = resolve }))
    render(<BackupSettingsSection />)
    fireEvent.click(await screen.findByRole('button', { name: '预览恢复' }))
    expect(screen.getByRole('button', { name: '立即完整备份' })).toBeDisabled()
    finish({ ...preview, checksumsValid: false })
    await waitFor(() => expect(screen.getByRole('button', { name: '确认恢复' })).toBeDisabled())
    expect(backupRepository.restoreSaved).not.toHaveBeenCalled()
  })
})
