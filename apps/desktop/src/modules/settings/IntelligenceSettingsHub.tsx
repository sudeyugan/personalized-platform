import { ImagePlus, ShieldCheck, Sparkles } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useLibraryStore } from '../../state/useLibraryStore'
import { AiSettingsSection } from './AiSettingsSection'
import { CompanionGrowthSection } from './CompanionGrowthSection'
import { CompanionSettingsSection } from './CompanionSettingsSection'

type IntelligencePanel = 'creation' | 'companion' | 'growth'

const storageKey = 'yiyu.settings.intelligence.panel'

interface PanelInfo {
  id: IntelligencePanel
  title: string
  description: string
  icon: ReactNode
}

const panels: PanelInfo[] = [
  { id: 'creation', title: 'AI 创作服务', description: '印象图、Provider 与密钥', icon: <Sparkles /> },
  { id: 'companion', title: '伙伴与权限', description: '称呼、对话与读取范围', icon: <ShieldCheck /> },
  { id: 'growth', title: '形象、记忆与成长', description: '桌面形象、长期记忆和性格', icon: <ImagePlus /> },
]

function initialPanel(): IntelligencePanel {
  const stored = localStorage.getItem(storageKey)
  return panels.some((panel) => panel.id === stored) ? stored as IntelligencePanel : 'creation'
}

export function IntelligenceSettingsHub() {
  const { data } = useLibraryStore()
  const [active, setActive] = useState<IntelligencePanel>(initialPanel)
  const permissions = data.companion.permissions
  const permissionCount = permissions.workIds.length + permissions.chapterIds.length + Number(permissions.records) + Number(permissions.musicContext)
  const status: Record<IntelligencePanel, string> = {
    creation: data.settings.ai.providerId === 'mock' ? '离线 Mock' : '自定义服务',
    companion: permissionCount ? `已授权 ${permissionCount} 项` : '默认无权限',
    growth: `${data.companion.memories.length} 条记忆 · ${data.companion.growth.enabled ? '成长已开启' : '成长已关闭'}`,
  }
  const choose = (panel: IntelligencePanel) => { setActive(panel); localStorage.setItem(storageKey, panel) }

  return <div className="intelligence-hub">
    <div className="intelligence-principles">
      <span><ShieldCheck size={14} /><strong>本地优先</strong><small>默认不联网</small></span>
      <span><Sparkles size={14} /><strong>主动触发</strong><small>不会后台生成</small></span>
      <span><ShieldCheck size={14} /><strong>权限可撤销</strong><small>伙伴默认不可读取资料</small></span>
    </div>
    <nav className="intelligence-nav" aria-label="智能创作设置分区">
      {panels.map((panel) => <button type="button" key={panel.id} className={active === panel.id ? 'active' : ''} aria-pressed={active === panel.id} onClick={() => choose(panel.id)}>
        <i>{panel.icon}</i><span><strong>{panel.title}</strong><small>{panel.description}</small></span><b>{status[panel.id]}</b>
      </button>)}
    </nav>
    <div className="intelligence-panel" id={`intelligence-panel-${active}`}>
      {active === 'creation' && <AiSettingsSection />}
      {active === 'companion' && <CompanionSettingsSection />}
      {active === 'growth' && <CompanionGrowthSection />}
    </div>
  </div>
}
