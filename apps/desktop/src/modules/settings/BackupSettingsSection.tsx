import { ArchiveRestore, Check, DatabaseBackup, FolderOpen, RefreshCw, ShieldCheck } from 'lucide-react'
import { useEffect, useState, type ChangeEvent } from 'react'
import { backupRepository, type BackupPreview, type BackupReceipt } from '../../infrastructure/backupRepository'
import { useLibraryStore } from '../../state/useLibraryStore'

export function BackupSettingsSection() {
  const { data, setBackupSettings } = useLibraryStore()
  const [backups, setBackups] = useState<BackupReceipt[]>([])
  const [restoreFile, setRestoreFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<BackupPreview | null>(null)
  const [message, setMessage] = useState('备份包含正文、版本、资料关系、图片和加密 vault，但不包含 API Key。')
  const backupDirectory = data.settings.backup.directory
  const refresh = () => void backupRepository.list(backupDirectory).then(setBackups).catch(() => setBackups([]))
  useEffect(() => { void backupRepository.list(backupDirectory).then(setBackups).catch(() => setBackups([])) }, [backupDirectory])
  const create = async () => { try { const receipt = await backupRepository.create(data.settings.backup.directory); setMessage(`备份已创建：${receipt.path}`); refresh() } catch (error) { setMessage(error instanceof Error ? error.message : '备份失败') } }
  const chooseRestore = async (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0] ?? null; event.target.value = ''; setRestoreFile(file); setPreview(null); if (!file) return; try { setPreview(await backupRepository.preview(file)); setMessage('恢复预览已完成；当前资料会先自动创建安全备份。') } catch (error) { setMessage(error instanceof Error ? error.message : '备份校验失败') } }
  const restore = async () => { if (!restoreFile || !preview?.checksumsValid || !window.confirm('恢复会替换当前资料库，并先保存恢复前安全备份。是否继续？')) return; try { await backupRepository.restore(restoreFile, data.settings.backup.directory); window.location.reload() } catch (error) { setMessage(error instanceof Error ? error.message : '恢复失败，当前资料未被静默删除') } }

  return <section className="settings-section"><div className="settings-title"><DatabaseBackup /><div><h2>备份与完整恢复</h2><p>每日一致性备份、SHA-256 校验、恢复预览和恢复前安全快照。</p></div></div>
    <div className="setting-row"><div><strong>每日自动备份</strong><span>每天首次启动时创建；加密作品保持加密</span></div><button className={data.settings.backup.dailyEnabled ? 'switch on' : 'switch'} onClick={() => setBackupSettings({ dailyEnabled: !data.settings.backup.dailyEnabled })}><i /></button></div>
    {data.settings.backup.lastAutomaticError ? <p className="settings-message error"><ShieldCheck size={14} />最近自动备份失败：{data.settings.backup.lastAutomaticError}</p> : data.settings.backup.lastAutomaticDate ? <p className="settings-message"><Check size={14} />最近自动备份已确认：{data.settings.backup.lastAutomaticDate}</p> : null}
    <label className="setting-row"><div><strong>备份目标目录</strong><span>留空使用应用默认目录；也可填写 Windows 绝对路径</span></div><input value={data.settings.backup.directory} placeholder="例如 D:\\一隅备份" onChange={(event) => setBackupSettings({ directory: event.target.value })} /></label>
    <label className="setting-row"><div><strong>自动备份保留数量</strong><span>手动备份不自动清理</span></div><input type="number" min="1" max="100" value={data.settings.backup.retentionCount} onChange={(event) => setBackupSettings({ retentionCount: Math.max(1, Number(event.target.value)) })} /></label>
    <div className="backup-actions"><button className="primary-button" onClick={() => void create()}><DatabaseBackup size={15} />立即完整备份</button><label className="ghost-button"><input type="file" accept=".yiyu-backup" onChange={(event) => void chooseRestore(event)} /><ArchiveRestore size={15} />选择备份恢复</label><button className="ghost-button" onClick={refresh}><RefreshCw size={14} />刷新记录</button></div>
    <p className="settings-message"><ShieldCheck size={14} />{message}</p>
    {preview && <div className="restore-preview"><strong><Check size={14} />校验{preview.checksumsValid ? '通过' : '失败'}</strong><span>作品 {preview.works} · 章节 {preview.chapters} · 素材 {preview.assets} · 加密 vault {preview.encryptedVaults}</span><small>来源版本 {preview.appVersion} · {preview.createdAt}</small><button className="primary-button" disabled={!preview.checksumsValid} onClick={() => void restore()}><ArchiveRestore size={14} />确认恢复</button></div>}
    <div className="backup-list">{backups.slice(0, 6).map((backup) => <div key={backup.path}><FolderOpen size={14} /><span><strong>{backup.automatic ? '自动备份' : '手动备份'}</strong><small>{backup.path} · {(backup.size / 1024 / 1024).toFixed(2)} MB</small></span></div>)}</div>
  </section>
}
