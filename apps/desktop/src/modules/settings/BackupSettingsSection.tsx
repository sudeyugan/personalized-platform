import { ArchiveRestore, Check, DatabaseBackup, FolderOpen, RefreshCw, ShieldCheck } from 'lucide-react'
import { useEffect, useState, type ChangeEvent } from 'react'
import { backupRepository, type BackupPreview, type BackupReceipt } from '../../infrastructure/backupRepository'
import { useLibraryStore } from '../../state/useLibraryStore'

import './BackupSettingsSection.css'

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error)

export function BackupSettingsSection() {
  const { data, setBackupSettings } = useLibraryStore()
  const [backups, setBackups] = useState<BackupReceipt[]>([])
  const [restoreFile, setRestoreFile] = useState<File | null>(null)
  const [restorePath, setRestorePath] = useState<string | null>(null)
  const [preview, setPreview] = useState<BackupPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('包含正文、历史、图片、WebM、音乐和加密 vault，不包含 API Key。')
  const backup = data.settings.backup
  const backupDirectory = backup.directory
  const refresh = () => void backupRepository.list(backupDirectory).then(setBackups).catch((error: unknown) => setMessage(errorMessage(error)))
  useEffect(() => {
    let active = true
    setPreview(null); setRestoreFile(null); setRestorePath(null); setBackups([])
    void backupRepository.list(backupDirectory).then((items) => { if (active) setBackups(items) })
      .catch((error: unknown) => { if (active) setMessage(errorMessage(error)) })
    return () => { active = false }
  }, [backupDirectory])

  const create = async () => {
    setBusy(true)
    try { const receipt = await backupRepository.create(backupDirectory); setMessage(`完整备份已创建：${receipt.path}`); refresh() }
    catch (error) { setMessage(errorMessage(error)) }
    finally { setBusy(false) }
  }
  const chooseRestore = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    event.target.value = ''
    setRestoreFile(file); setRestorePath(null); setPreview(null)
    if (!file) return
    setBusy(true)
    try { setPreview(await backupRepository.preview(file)); setMessage('恢复预览已完成；恢复前会先保存当前资料的完整安全备份。') }
    catch (error) { setMessage(errorMessage(error)) }
    finally { setBusy(false) }
  }
  const chooseSaved = async (item: BackupReceipt) => {
    setRestoreFile(null); setRestorePath(item.path); setPreview(null); setBusy(true)
    try { setPreview(await backupRepository.previewSaved(item.path, backupDirectory)); setMessage(`已校验：${item.path}`) }
    catch (error) { setMessage(errorMessage(error)) }
    finally { setBusy(false) }
  }
  const restore = async () => {
    if ((!restoreFile && !restorePath) || !preview?.checksumsValid || !window.confirm('恢复会替换当前资料库，并先保存恢复前完整安全备份。是否继续？')) return
    setBusy(true)
    try {
      if (restorePath) await backupRepository.restoreSaved(restorePath, backupDirectory)
      else if (restoreFile) await backupRepository.restore(restoreFile, backupDirectory)
      window.location.reload()
    } catch (error) { setMessage(errorMessage(error)); setBusy(false) }
  }

  return <section className="settings-section">
    <div className="settings-title"><DatabaseBackup /><div><h2>备份与完整恢复</h2><p>轻量自动快照、完整手动备份与恢复前校验。</p></div></div>
    <div className="setting-row"><div><strong>自动备份</strong><span>到期后首次启动时创建；相同素材只保存一份，加密作品保持加密</span></div><button className={backup.dailyEnabled ? 'switch on' : 'switch'} aria-label="自动备份" aria-pressed={backup.dailyEnabled} onClick={() => setBackupSettings({ dailyEnabled: !backup.dailyEnabled })}><i /></button></div>
    {backup.lastAutomaticError ? <p className="settings-message error"><ShieldCheck size={14} />最近自动备份失败：{backup.lastAutomaticError}</p> : backup.lastAutomaticDate ? <p className="settings-message"><Check size={14} />最近自动备份：{backup.lastAutomaticDate}</p> : null}
    <label className="setting-row"><div><strong>自动备份间隔</strong><span>按本地日期计算，默认每 3 天一次</span></div><input aria-label="自动备份间隔" type="number" min="1" max="30" value={backup.intervalDays} onChange={(event) => setBackupSettings({ intervalDays: Math.min(30, Math.max(1, Math.round(Number(event.target.value) || 1))) })} /></label>
    <label className="setting-row"><div><strong>备份目标目录</strong><span>留空使用应用默认目录；也可填写 Windows 绝对路径</span></div><input disabled={busy} value={backupDirectory} placeholder="例如 D:\\一隅备份" onChange={(event) => setBackupSettings({ directory: event.target.value })} /></label>
    <label className="setting-row"><div><strong>自动备份保留数量</strong><span>默认保留 3 份；手动备份不自动清理</span></div><input aria-label="自动备份保留数量" type="number" min="1" max="100" value={backup.retentionCount} onChange={(event) => setBackupSettings({ retentionCount: Math.min(100, Math.max(1, Math.round(Number(event.target.value) || 1))) })} /></label>
    <div className="backup-actions">
      <button className="primary-button" disabled={busy} onClick={() => void create()}><DatabaseBackup size={15} />立即完整备份</button>
      <label className="ghost-button"><input type="file" accept=".yiyu-backup" disabled={busy} onChange={(event) => void chooseRestore(event)} /><ArchiveRestore size={15} />选择完整备份恢复</label>
      <button className="ghost-button" disabled={busy} onClick={refresh}><RefreshCw size={14} />刷新记录</button>
    </div>
    <p className="settings-message"><ShieldCheck size={14} />{busy ? '正在后台处理备份，请稍候…' : message}</p>
    <p className="settings-message">自动快照从下方记录中恢复。迁移时请复制整个备份目录，包含“共享素材”文件夹；单独携带请使用完整备份。记录显示的是快照文件大小，不含共享素材。</p>
    {preview && <div className="restore-preview"><strong><Check size={14} />校验{preview.checksumsValid ? '通过' : '失败'}</strong><span>作品 {preview.works} · 章节 {preview.chapters} · 素材 {preview.assets} · 加密 vault {preview.encryptedVaults}</span><small>来源版本 {preview.appVersion} · {preview.createdAt}</small><button className="primary-button" disabled={busy || !preview.checksumsValid} onClick={() => void restore()}><ArchiveRestore size={14} />确认恢复</button></div>}
    <div className="backup-list">{backups.map((item) => <div key={item.path}><FolderOpen size={14} /><span><strong>{item.shared ? '自动快照' : item.automatic ? '旧自动备份' : '完整备份'}</strong><small>{item.path} · {(item.size / 1024 / 1024).toFixed(2)} MB</small></span><button className="ghost-button" disabled={busy} onClick={() => void chooseSaved(item)}><ArchiveRestore size={14} />预览恢复</button></div>)}</div>
  </section>
}
