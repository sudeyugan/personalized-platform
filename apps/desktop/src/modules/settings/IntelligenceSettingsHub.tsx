import { Sparkles } from 'lucide-react'
import { useLibraryStore } from '../../state/useLibraryStore'
import { AiSettingsSection } from './AiSettingsSection'
import { CompanionGrowthSection } from './CompanionGrowthSection'
import { CompanionSettingsSection } from './CompanionSettingsSection'

export function IntelligenceSettingsHub() {
  const { data } = useLibraryStore()
  const permissions = data.companion.permissions
  const permissionCount = permissions.workIds.length + permissions.chapterIds.length + Number(permissions.records) + Number(permissions.planner) + Number(permissions.diary) + Number(permissions.mood) + Number(permissions.memories) + Number(permissions.answerBook) + Number(permissions.musicContext)
  const chatProvider = data.companion.provider.providerId === 'deepseek' ? 'DeepSeek' : data.companion.provider.providerId === 'mock' ? '本地 Mock' : '自定义'
  const imageProvider = data.settings.ai.providerId === 'openrouter' ? 'OpenRouter' : data.settings.ai.providerId === 'mock' ? '本地 Mock' : '自定义'

  return <section className="settings-section ai-companion-single">
    <div className="settings-title"><Sparkles /><div><h2>AI 伙伴</h2><p>常用显示设置直接调整，模型、权限与记忆按需展开。</p></div></div>

    <details className="ai-settings-fold" name="ai-companion-settings" open>
      <summary><span><strong>形象与显示</strong><small>立绘、桌面开关与快捷键</small></span><b>{data.companion.desktop.visible ? '显示中' : '已隐藏'}</b></summary>
      <div className="ai-settings-fold-body"><CompanionGrowthSection /></div>
    </details>

    <details className="ai-settings-fold" name="ai-companion-settings">
      <summary><span><strong>模型服务</strong><small>对话与图像生成分开配置</small></span><b>{chatProvider} · {imageProvider}</b></summary>
      <div className="ai-settings-fold-body ai-model-stack"><CompanionSettingsSection mode="profile" /><AiSettingsSection /></div>
    </details>

    <details className="ai-settings-fold" name="ai-companion-settings">
      <summary><span><strong>权限与记录</strong><small>默认不读取资料，授权可随时撤销</small></span><b>{permissionCount ? `已授权 ${permissionCount} 项` : '无授权'}</b></summary>
      <div className="ai-settings-fold-body"><CompanionSettingsSection mode="permissions" /></div>
    </details>
  </section>
}
