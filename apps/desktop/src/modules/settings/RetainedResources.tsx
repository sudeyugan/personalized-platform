import { Database } from 'lucide-react'
import { useLibraryStore } from '../../state/useLibraryStore'

export function RetainedResources() {
  const { data, navigate } = useLibraryStore()
  return <section className="settings-section"><div className="settings-title"><Database /><div><h2>保留的资源</h2><p>不占用创作导航；原有图片、音频和正文插图继续保留。</p></div></div>
    <div className="setting-row"><div><strong>图片管理</strong><span>{data.assets.filter(asset => !asset.deletedAt && asset.purpose !== 'companion' && asset.purpose !== 'experience').length} 个图片素材，查看引用和收纳袋</span></div><button onClick={() => navigate('assets')} type="button">管理图片</button></div>
    <div className="setting-row"><div><strong>旧本地曲库</strong><span>{data.tracks.length} 首已导入音频；不会自动开始播放</span></div><button onClick={() => navigate('music')} type="button">打开曲库</button></div>
  </section>
}
