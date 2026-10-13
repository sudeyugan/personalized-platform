import type { RecoverableExperienceDraft } from './experienceDraftRecovery'

export function ExperienceDraftControls({ enabled, pending, message, originalUpdatedAt, toggle, restore, discard, disabled = false, recoveryFailed = false }: {
  enabled: boolean; pending?: RecoverableExperienceDraft; message: string; originalUpdatedAt?: string; disabled?: boolean; recoveryFailed?: boolean
  toggle: (value: boolean) => void; restore: () => void; discard: () => void
}) {
  return <div className="experience-draft-controls">
    <label><input type="checkbox" disabled={disabled} checked={enabled} onChange={event => toggle(event.target.checked)} />退出后保留文字草稿 · 可选</label>
    <small>本机明文、最多六份，不随备份迁移；不保存未入库封面，不上传或写成正式记录。关闭会清除本资料库的恢复草稿。</small>
    {recoveryFailed && <button type="button" className="ghost-button" disabled={disabled} onClick={() => toggle(false)}>清除损坏的本机草稿</button>}
    {pending && <div role="status"><p>发现未保存的文字草稿：{pending.draft.title || '未命名经历'}。</p>
      {pending.originalUpdatedAt && pending.originalUpdatedAt !== originalUpdatedAt && <p>原卡片已更新。恢复后请核对，保存才会覆盖正式记录。</p>}
      <button type="button" className="ghost-button" disabled={disabled} onClick={restore}>恢复文字草稿</button><button type="button" className="ghost-button" disabled={disabled} onClick={discard}>丢弃这份草稿</button>
    </div>}
    {message && <small role="status">{message}</small>}
  </div>
}
