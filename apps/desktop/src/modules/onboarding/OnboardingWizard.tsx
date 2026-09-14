import { ArrowLeft, ArrowRight, Check, Database, FolderArchive, Palette, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import type { ThemeId } from '../../domain/models'

export interface OnboardingResult { libraryDirectory: string; backupDirectory: string; theme: ThemeId }

export function OnboardingWizard({ defaultDirectory, onComplete }: { defaultDirectory: string; onComplete: (result: OnboardingResult) => Promise<void> }) {
  const [step, setStep] = useState(0)
  const [libraryDirectory, setLibraryDirectory] = useState('')
  const [backupDirectory, setBackupDirectory] = useState('')
  const [theme, setTheme] = useState<ThemeId>('warm')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const finish = async () => { setBusy(true); setError(''); try { await onComplete({ libraryDirectory, backupDirectory, theme }) } catch (reason) { setError(reason instanceof Error ? reason.message : '初始化失败，请检查目录后重试'); setBusy(false) } }

  return <main className="onboarding-screen"><section className="onboarding-card">
    <header><div className="brand-mark">隅</div><div><p className="eyebrow">首次设置 · {step + 1}/3</p><h1>{step === 0 ? '欢迎来到一隅' : step === 1 ? '安放你的资料' : '选择日常偏好'}</h1></div></header>
    <div className="onboarding-progress"><span className="done" /><span className={step >= 1 ? 'done' : ''} /><span className={step >= 2 ? 'done' : ''} /></div>
    {step === 0 && <div className="onboarding-body welcome"><ShieldCheck /><p>一隅默认离线工作。正文、图片和备份由你掌控；AI 不会在后台读取或发送文稿。</p><ul><li>自动保存和异常草稿恢复</li><li>可校验的完整备份</li><li>作品级加密与开放格式导出</li></ul></div>}
    {step === 1 && <div className="onboarding-body"><label><span><Database />资料库目录</span><input value={libraryDirectory} onChange={(event) => setLibraryDirectory(event.target.value)} placeholder={defaultDirectory} /><small>留空使用系统推荐目录。也可填写一个 Windows 绝对路径，或选择已有一隅资料库所在目录。</small></label><label><span><FolderArchive />备份目录</span><input value={backupDirectory} onChange={(event) => setBackupDirectory(event.target.value)} placeholder="留空使用资料库内的 backups 目录" /><small>建议放在另一块磁盘或同步盘目录；备份内容不会包含 AI API Key。</small></label></div>}
    {step === 2 && <div className="onboarding-body"><div className="onboarding-theme-title"><Palette />默认主题</div><div className="onboarding-themes">{([['warm', '安静温暖'], ['light', '清透日光'], ['dark', '深夜书房']] as const).map(([id, label]) => <button key={id} className={theme === id ? `theme-${id} active` : `theme-${id}`} onClick={() => setTheme(id)}><span />{label}{theme === id && <Check size={14} />}</button>)}</div><p className="onboarding-note">完成后可以随时在“设置”中调整主题、备份、布局和加密。忘记加密密码时无法恢复，请妥善保管。</p></div>}
    {error && <p className="onboarding-error">{error}</p>}
    <footer>{step > 0 ? <button className="ghost-button" disabled={busy} onClick={() => setStep(step - 1)}><ArrowLeft size={15} />上一步</button> : <span />}{step < 2 ? <button className="primary-button" onClick={() => setStep(step + 1)}>下一步<ArrowRight size={15} /></button> : <button className="primary-button" disabled={busy} onClick={() => void finish()}>{busy ? '正在准备资料库…' : '进入一隅'}<Check size={15} /></button>}</footer>
  </section></main>
}
