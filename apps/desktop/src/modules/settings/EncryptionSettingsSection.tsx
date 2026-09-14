import { AlertTriangle, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useLibraryStore } from '../../state/useLibraryStore'

export function EncryptionSettingsSection() {
  const { data, encryptWork, lockWork, setSecuritySettings } = useLibraryStore()
  const candidates = data.works.filter((work) => !work.deletedAt && !work.encrypted)
  const encrypted = data.works.filter((work) => !work.deletedAt && work.encrypted)
  const [workId, setWorkId] = useState(candidates[0]?.id ?? '')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [understood, setUnderstood] = useState(false)
  const [message, setMessage] = useState('加密后标题、正文、版本、关系和图片进入独立 vault；普通数据库只保留匿名锁定占位。')
  const enable = async () => { if (password.length < 8 || password !== confirm || !understood || !workId) return; try { await encryptWork(workId, password); setPassword(''); setConfirm(''); setUnderstood(false); setMessage('作品已加密并锁定。请立即创建完整备份。') } catch (error) { setMessage(error instanceof Error ? error.message : '加密失败，原资料未被删除') } }
  return <section className="settings-section"><div className="settings-title"><LockKeyhole /><div><h2>作品级加密 vault</h2><p>Argon2id + XChaCha20-Poly1305；密钥只在 Rust 内存中按时限保留。</p></div></div>
    <label className="setting-row"><div><strong>自动锁定时间</strong><span>应用进入后台会立即锁定；前台无操作按此时限过期</span></div><select value={data.settings.security.autoLockMinutes} onChange={(event) => setSecuritySettings({ autoLockMinutes: Number(event.target.value) })}><option value="5">5 分钟</option><option value="15">15 分钟</option><option value="30">30 分钟</option><option value="60">60 分钟</option></select></label>
    {candidates.length > 0 && <div className="vault-create"><label><span>选择作品</span><select value={workId} onChange={(event) => setWorkId(event.target.value)}>{candidates.map((work) => <option key={work.id} value={work.id}>{work.title}</option>)}</select></label><label><span>作品密码</span><input type="password" value={password} placeholder="至少 8 个字符" onChange={(event) => setPassword(event.target.value)} /></label><label><span>再次输入</span><input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} /></label><label className="vault-warning"><input type="checkbox" checked={understood} onChange={(event) => setUnderstood(event.target.checked)} /><AlertTriangle size={15} /><span>我知道忘记密码无法恢复，完整备份也不会包含密码。</span></label><button className="primary-button" disabled={!understood || password.length < 8 || password !== confirm || !workId} onClick={() => void enable()}><KeyRound size={15} />加密并立即锁定</button></div>}
    <p className="settings-message"><ShieldCheck size={14} />{message}</p>
    <div className="encrypted-work-list">{encrypted.map((work) => <div key={work.id}><LockKeyhole size={14} /><span><strong>{work.locked ? '已锁定作品' : work.title}</strong><small>{work.locked ? '标题和内容已隐藏' : '当前已解锁；切到后台会自动锁定'}</small></span>{!work.locked && <button onClick={() => void lockWork(work.id)}>立即锁定</button>}</div>)}</div>
  </section>
}
