import { useMemo } from 'react'
import { useLibraryStore } from '../../state/useLibraryStore'
import { describeCapabilityStatus } from '../companion/agent/capabilityStatus'
import './companionCapabilities.css'

export function CompanionCapabilityPanel() {
  const data = useLibraryStore(state => state.data)
  const temporary = useLibraryStore(state => state.temporaryCompanionWorkIds)
  const capabilities = useMemo(() => describeCapabilityStatus(data, temporary), [data, temporary])
  return <details className="companion-capabilities">
    <summary>小鱼现在能做什么</summary>
    <p>依据当前已注册工具和权限实时生成。状态表示权限检查结果，具体目标、输入与服务仍需在执行时验证；“完整程序权限”不会接通所有页面按钮。</p>
    {capabilities.features.map(feature => <details key={feature.id}><summary>{feature.description} · {feature.actions.length ? `${feature.actions.length} 项已接入` : '仅导航'}{feature.enabled === false ? ' · 已关闭' : feature.available === false ? ' · 暂不可用' : ''}</summary>
      {feature.actions.map(action => <div key={action.name}><strong>{action.description}</strong><span>{action.status}</span><small>{action.reason}</small></div>)}
      {!feature.actions.length && <p>可打开此页面，页面内操作尚未接入小鱼。</p>}
    </details>)}
    <details><summary>全局、联网与电脑动作</summary>{capabilities.global.map(action => <div key={action.name}><strong>{action.description}</strong><span>{action.status}</span><small>{action.reason}</small></div>)}</details>
    <p>尚未接入：找封面与选图、排行拖动、章节排序、版本恢复、任意导入导出、主题设置、QQ 伴听控制。它们不是“权限不足”。删除、密钥、加密解锁、备份恢复仍由你手动处理；电脑动作使用独立开关和目标授权。</p>
  </details>
}
