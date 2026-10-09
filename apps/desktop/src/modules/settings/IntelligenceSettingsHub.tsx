import { Sparkles } from 'lucide-react'
import { useLibraryStore } from '../../state/useLibraryStore'
import { AiSettingsSection } from './AiSettingsSection'
import { CompanionGrowthSection } from './CompanionGrowthSection'
import { CompanionSettingsSection } from './CompanionSettingsSection'
import { CompanionVoiceSettings } from './CompanionVoiceSettings'

export function IntelligenceSettingsHub() {
  const { data } = useLibraryStore()
  const permissions = data.companion.permissions
  const permissionCount = permissions.fullAccess ? '完整程序权限' : permissions.workIds.length + permissions.chapterIds.length + Number(permissions.records) + Number(permissions.planner) + Number(permissions.diary) + Number(permissions.mood) + Number(permissions.memories) + Number(permissions.answerBook) + Number(permissions.experiences) + Number(permissions.assets) + Number(permissions.musicContext)
  const chatProvider = data.companion.provider.providerId === 'deepseek' ? 'DeepSeek' : data.companion.provider.providerId === 'mock' ? '本地 Mock' : '自定义'
  const imageProvider = data.settings.ai.providerId === 'openrouter' ? 'OpenRouter' : data.settings.ai.providerId === 'mock' ? '本地 Mock' : '自定义'

  return <section className="settings-section ai-companion-single">
    <div className="settings-title"><Sparkles /><div><h2>如何交流，由你决定</h2><p>模型、语音与授权分开管理；桌宠形象在“桌面伙伴”。</p></div></div>

    <details className="ai-settings-fold" name="ai-companion-settings">
      <summary><span><strong>模型服务</strong><small>对话与图像生成分开配置</small></span><b>{chatProvider} · {imageProvider}</b></summary>
      <div className="ai-settings-fold-body ai-model-stack"><CompanionSettingsSection mode="profile" /><AiSettingsSection /></div>
    </details>

    <details className="ai-settings-fold" name="ai-companion-settings">
      <summary><span><strong>语音与唤醒</strong><small>朗读、麦克风与本地唤醒</small></span><b>{data.companion.voice.wakeEnabled ? '唤醒已开启' : '按需启用'}</b></summary>
      <div className="ai-settings-fold-body"><CompanionVoiceSettings /></div>
    </details>

    <details className="ai-settings-fold" name="ai-companion-settings">
      <summary><span><strong>权限与记录</strong><small>授权可随时撤销，高风险操作始终保留安全边界</small></span><b>{typeof permissionCount === 'string' ? permissionCount : permissionCount ? `已授权 ${permissionCount} 项` : '无授权'}</b></summary>
      <div className="ai-settings-fold-body"><CompanionSettingsSection mode="permissions" /></div>
    </details>
    <details className="ai-settings-fold" name="ai-companion-settings">
      <summary><span><strong>记忆与性格</strong><small>手动记忆、轻微成长与可撤销记录</small></span><b>{data.companion.memories.length} 条记忆</b></summary>
      <div className="ai-settings-fold-body"><CompanionGrowthSection /></div>
    </details>
  </section>
}
