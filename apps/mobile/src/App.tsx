import { useEffect, useState, useSyncExternalStore } from 'react'
import { conflicts, heads } from '@yiyu/sync'
import { Editor } from './Editor'
import { Chat } from './Chat'
import { TodoCheck } from './TodoCheck'
import { getSnapshot, initialize, join, resolveVersion, subscribe, sync, update } from './repository'
import pet from '../../desktop/src/modules/companion/pixel-pet/art/assets/pixel-free-v1.png'

declare global { interface Window { YiyuMobile?: { showPet(): void; hidePet(): void; saveApiKey(value: string): boolean; chat(id: string, prompt: string): void } } }
const tabs = [['todos', '今日'], ['diary', '手记'], ['moods', '心情'], ['ideas', '想法'], ['experiences', '经历'], ['library', '资料'], ['chat', '小鱼'], ['settings', '连接']] as const
const date = () => new Date().toLocaleDateString('sv-SE')
const moods = ['happy', 'satisfied', 'hopeful', 'grateful', 'lighthearted', 'relaxed', 'calm', 'disgusted', 'lost', 'uneasy', 'empty', 'tired', 'lonely', 'sad', 'wronged', 'anxious', 'irritated', 'angry']
const labels = ['开心', '满足', '期待', '感激', '轻松', '放松', '平静', '厌恶', '迷茫', '不安', '空虚', '疲惫', '孤独', '难过', '委屈', '焦虑', '烦躁', '愤怒']
export default function App() {
  const { records, state, error, busy, applying, lastSync } = useSyncExternalStore(subscribe, getSnapshot)
  const [tab, setTab] = useState('todos')
  const [editing, setEditing] = useState<string | null>(null)
  const [raw, setRaw] = useState('')
  const [message, setMessage] = useState('')
  const [ready, setReady] = useState(false)
  const [period, setPeriod] = useState('evening')
  const [points, setPoints] = useState<Record<string, number>>({})
  const [apiKey, setApiKey] = useState('')
  useEffect(() => {
    void initialize().then(() => { setReady(true); void sync() }).catch(e => setMessage(String(e)))
    const resume = () => { if (!document.hidden) void sync() }
    const timer = setInterval(resume, 30_000)
    window.addEventListener('online', resume); document.addEventListener('visibilitychange', resume)
    return () => { clearInterval(timer); window.removeEventListener('online', resume); document.removeEventListener('visibilitychange', resume) }
  }, [])
  const act = async (job: () => Promise<unknown>) => { try { setMessage(''); await job() } catch (e) { setMessage(e instanceof Error ? e.message : '操作未完成') } }
  const create = async (kind: string) => {
    const id = crypto.randomUUID(), now = new Date().toISOString()
    const key = kind === 'diary' ? `diary/${date()}` : `${kind}/${id}`
    if (!records[key]) await update(key, kind === 'diary' ? { date: date(), title: '', content: '', updatedAt: now } : { id, title: '', note: '', priority: 'medium', completed: false, createdAt: now })
    setEditing(key)
  }
  const values = Object.entries(records).filter(([key, value]) => !value.deletedAt && (tab === 'library' ? /^(works|chapters|people|places|courses|assignments|calendar)\//.test(key) : key.startsWith(`${tab}/`)))
  if (!ready) return <main className="loading">{message || '正在拾起这一隅…'}</main>
  return <main>
    <header className="masthead"><div><small>一 隅 · 随 行</small><h1>把生活，轻轻放好。</h1></div><button onClick={() => void sync()} disabled={busy}>{busy ? '同步中' : state ? '同步' : '离线'}</button></header>
    <nav aria-label="页面">{tabs.map(([id, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}</nav>
    {(error || message) && <p role="status" className="notice">{message || error}</p>}
    {tab === 'settings' ? <section className="connection"><h2>此刻在这里，下次在那里</h2><p>常开电脑作私人中枢，手机仍有自己的离线资料。关闭手机不会关闭中枢。</p>{state ? <><p>已连接 · {state.config.name}<br/><small>{lastSync ? `最近同步 ${new Date(lastSync).toLocaleTimeString()}` : '等待同步'} · {state.pending.length} 项待发送</small></p>{conflicts(state).map(key => <details key={key}><summary>有不同修改 · {key.split('/')[0]}</summary>{heads(state, key).map(version => <div key={version.id}><pre>{JSON.stringify(version.value, null, 2) ?? '删除记录'}</pre><button onClick={() => void act(() => resolveVersion(key, version.id))}>使用这一版</button></div>)}</details>)}</> : <><label>在电脑「数据管理」生成邀请，粘贴到这里<textarea value={raw} onChange={e => setRaw(e.target.value)} autoComplete="off" spellCheck={false}/></label><button disabled={!raw.trim()} onClick={() => void act(async () => { await join(raw, '我的手机'); setRaw('') })}>连接我的中枢</button></>}
      <label>手机单独配置 DeepSeek API Key<input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} autoComplete="off"/></label><p className="footnote">仅存 Android Keystore 保护的本机密文，不从电脑同步。保存空值会删除手机密钥。</p><button disabled={!window.YiyuMobile} onClick={() => { const ok = window.YiyuMobile?.saveApiKey(apiKey.trim()); setApiKey(''); setMessage(ok ? '手机模型密钥已更新。' : '保存失败；未启用手机模型。') }}>保存手机密钥</button>
      <div className="pet-card"><img src={pet} alt="小鱼"/><div><h3>也陪你在桌面</h3><p>需要你开启悬浮层；常驻时会显示系统通知，可随时收起。</p><button disabled={!window.YiyuMobile} onClick={() => window.YiyuMobile?.showPet()}>开启小鱼</button><button disabled={!window.YiyuMobile} onClick={() => window.YiyuMobile?.hidePet()}>收起</button></div></div><p className="footnote">首版同步文本资料，附件/音乐/加密作品及电脑权限不迁移。同步不是备份；邀请含密钥，勿公开。手机端不远程控制电脑。未在后台无限保活同步。</p></section> : tab === 'chat' ? <Chat /> : <>
      <div className="section-heading"><h2>{tabs.find(([id]) => id === tab)?.[1]}</h2>{(tab === 'todos' || tab === 'diary') && <button onClick={() => void act(() => create(tab))}>＋ 留一笔</button>}</div>
      {tab === 'moods' && <section className="mood-entry"><h3>此刻的心情</h3><select aria-label="时间段" value={period} onChange={e => setPeriod(e.target.value)}><option value="morning">早晨</option><option value="afternoon">午后</option><option value="evening">晚上</option></select><p>分配五点，今天也值得被看见。</p><div>{moods.map((mood, i) => <button key={mood} onClick={() => setPoints(old => Object.values(old).reduce((n, p) => n + p, 0) < 5 ? { ...old, [mood]: (old[mood] ?? 0) + 1 } : old)}>{labels[i]} {points[mood] || ''}</button>)}</div><button onClick={() => setPoints({})}>重选</button><button disabled={Object.values(points).reduce((n, p) => n + p, 0) !== 5} onClick={() => void act(async () => {
        const key = `moods/${date()}-${period}`, existing = records[key]
        if (existing && !confirm('这个时间段已有记录，确认替换？')) return
        const now = new Date().toISOString(); await update(key, { id: `${date()}-${period}`, date: date(), period, points, createdAt: existing?.createdAt ?? now, updatedAt: now }); setPoints({})
      })}>记下五点</button></section>}
      {!values.length && <div className="empty">这里还留着空白。<br/><small>可以先记下，也可以连接电脑带来资料。</small></div>}
      {values.map(([key, value]) => <article className="record" key={key}><div>{tab === 'todos' && <TodoCheck recordKey={key} value={value} disabled={applying}/>}<h3>{String(value.title ?? value.name ?? value.date ?? '一份记录')}</h3></div><p>{String(value.note ?? value.content ?? value.draft ?? value.description ?? value.summary ?? value.plainText ?? (value.points ? Object.entries(value.points as Record<string, number>).map(([m, n]) => `${labels[moods.indexOf(m)] ?? m} ${n}`).join(' · ') : ''))}</p>{['todos', 'diary', 'ideas'].includes(tab) && <button disabled={applying} onClick={() => setEditing(key)}>展开手稿</button>}{tab === 'todos' && <button disabled={applying} onClick={() => { if (confirm('删除这条待办？删除会同步到其他设备。')) void act(() => update(key, null)) }}>删除</button>}</article>)}
    </>}
    {editing && records[editing] && <Editor recordKey={editing} value={records[editing]} close={() => { setEditing(null); void sync() }}/>}<footer>有一隅，便有归处。</footer>
  </main>
}
