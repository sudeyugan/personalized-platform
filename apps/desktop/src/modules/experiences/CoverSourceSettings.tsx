import { useEffect, useState } from 'react'
import { experienceCovers, isDesktop } from '../../infrastructure/experienceCovers'
import './coverSourceSettings.css'

function SourceKey({ provider }: { provider: 'weread' | 'tmdb' }) {
  const [saved, setSaved] = useState(false)
  const [key, setKey] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { let active = true; void experienceCovers.hasKey(provider).then(value => { if (active) setSaved(value) }).catch(() => { if (active) setMessage('无法读取密钥状态') }); return () => { active = false } }, [provider])
  const changeKey = async (remove = false) => {
    setBusy(true)
    try {
      if (remove) await experienceCovers.deleteKey(provider)
      else await experienceCovers.storeKey(provider, key)
      setSaved(!remove); setKey(''); setMessage(remove ? '已删除本机密钥' : '已由Windows安全存储保护；尚未验证联网')
    } catch { setMessage('密钥操作失败，请在Windows桌面版重试') }
    finally { setBusy(false) }
  }
  const name = provider === 'weread' ? '微信读书 API Key' : 'TMDB API Read Access Token'
  return <div className="experience-source-key"><label><span>{name}</span><input type="password" aria-label={name} autoComplete="off" disabled={!isDesktop() || busy} value={key} placeholder={saved ? '已保存，输入可替换' : '可选，不配置也能记录'} onChange={event => setKey(event.target.value)} /></label>
    <div><button type="button" disabled={!key.trim() || busy || !isDesktop()} onClick={() => void changeKey()}>{saved ? '替换' : '保存'}</button>{saved && <button type="button" disabled={busy} onClick={() => void changeKey(true)}>删除密钥</button>}
      <a href={provider === 'weread' ? 'https://weread.qq.com/r/weread-skills' : 'https://www.themoviedb.org/settings/api'} target="_blank" rel="noreferrer">获取方式 ↗</a></div>{message && <p role="status">{message}</p>}
  </div>
}
export function CoverSourceSettings() {
  return <details className="experience-source-settings"><summary>封面来源设置 · 可选</summary>
    <p>只在主动找封面时发送名称和类别，不发送感想、排行或日期。不使用AI，不读取微信书架或笔记。密钥留在此电脑，迁移时需重新配置。</p>
    <SourceKey provider="weread" /><SourceKey provider="tmdb" />
    <p>动漫、漫画、游戏用Bangumi；书籍可用Open Library。中文网文优先微信读书，覆盖不保证。链接识别目前支持番茄公开作品页和Bangumi，遇到登录/验证就停止。</p>
    <p>封面用于个人记录，保留来源、不做全库抓取；导出或对外分享前请确认图片使用权限。</p>
    <div className="experience-source-credits"><a href="https://bgm.tv/" target="_blank" rel="noreferrer">Bangumi</a><a href="https://openlibrary.org/" target="_blank" rel="noreferrer">Open Library</a>
      <a className="tmdb-credit" href="https://www.themoviedb.org/" target="_blank" rel="noreferrer"><img src="/tmdb-attribution.svg" alt="The Movie Database" />TMDB</a></div>
    <p lang="en">This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
    <p>TMDB标志：Travis Bell，<a href="https://commons.wikimedia.org/wiki/File:Tmdb.new.logo.svg" target="_blank" rel="noreferrer">原始来源</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>，未修改。</p>
  </details>
}
