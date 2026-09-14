import { KeyRound, LockKeyhole } from 'lucide-react'
import { useState } from 'react'
import type { Work } from '../../domain/models'
import { useLibraryStore } from '../../state/useLibraryStore'

export function EncryptedWorkGate({ work }: { work: Work }) {
  const unlockWork = useLibraryStore((state) => state.unlockWork)
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('标题、正文、版本、图片和关系已从普通资料库与搜索索引中隐藏。')
  const unlock = async () => { try { await unlockWork(work.id, password); setPassword('') } catch (error) { setMessage(error instanceof Error ? error.message : '无法解锁作品') } }
  return <main className="vault-gate"><div className="vault-mark"><LockKeyhole size={28} /></div><p className="eyebrow">加密作品</p><h1>这一隅已经锁好</h1><p>{message}</p><form onSubmit={(event) => { event.preventDefault(); void unlock() }}><label><KeyRound size={16} /><input type="password" autoFocus value={password} placeholder="输入作品密码" onChange={(event) => setPassword(event.target.value)} /></label><button className="primary-button" disabled={!password}>解锁</button></form><small>密码不会发送到前端日志或写入资料库。忘记密码无法恢复内容，请保留完整备份。</small></main>
}
