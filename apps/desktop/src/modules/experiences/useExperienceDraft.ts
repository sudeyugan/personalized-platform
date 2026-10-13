import { useEffect, useRef, useState } from 'react'
import type { ExperienceDraft, ExperienceEntry } from '../../domain/experiences'
import { useLibraryStore } from '../../state/useLibraryStore'
import { readExperienceRecovery, removeExperienceRecovery, saveExperienceRecovery, setExperienceRecovery } from './experienceDraftRecovery'

// One in-memory draft only: navigation is safe without persisting private unsaved text/images.
let sessionDraft: { key: string; draft: ExperienceDraft; file?: File; missingCover?: boolean } | undefined
export function useExperienceDraft(entry: ExperienceEntry | undefined, place: boolean) {
  const key = entry?.id ?? (place ? 'new-place' : 'new-work')
  const scope = useLibraryStore(state => state.health?.libraryPath ?? (state.health?.runtime === 'tauri' ? '' : 'browser-preview'))
  const sessionKey = `${scope}:${key}`
  const remembered = sessionDraft?.key === sessionKey ? sessionDraft : undefined
  const [recovery, setRecovery] = useState(() => {
    try { return { ...readExperienceRecovery(scope), error: '' } }
    catch { return { version: 1 as const, enabled: false, drafts: [], error: '本机草稿读取失败，请关闭恢复清除后重试。' } }
  })
  const [pending, setPending] = useState(() => recovery.drafts.find(item => item.key === key))
  const [recoveryMessage, setRecoveryMessage] = useState(recovery.error)
  const [draft, setDraft] = useState<ExperienceDraft>(() => remembered?.draft ?? entry ?? { category: place ? 'place' : 'novel', title: '', creator: '', dateText: '', note: '', paperStyle: 'linen' })
  const [file, setDraftFile] = useState<File | undefined>(remembered?.file)
  const [missingCover, setMissingCover] = useState(Boolean(remembered?.missingCover))
  const setFile = (value: File | undefined) => { setDraftFile(value); setMissingCover(false) }
  const [dirty, setDirty] = useState(Boolean(remembered))
  const latest = useRef({ draft, file, dirty, missingCover }); latest.current = { draft, file, dirty, missingCover }
  useEffect(() => {
    if (!scope || !recovery.enabled || !dirty || pending) return
    try { saveExperienceRecovery(scope, { key, draft, updatedAt: new Date().toISOString(), originalUpdatedAt: entry?.updatedAt, coverNeedsReselect: Boolean(file) || missingCover }); setRecoveryMessage(missingCover ? '文字已恢复，未保存的封面请重新选择。' : '文字草稿已保留在本机，尚未存入经历册。') }
    catch { setRecoveryMessage('文字草稿保存失败，请先保存卡片再退出。') }
  }, [scope, recovery.enabled, dirty, pending, key, draft, file, missingCover, entry?.updatedAt])
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => { if (latest.current.dirty) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', protect)
    return () => {
      window.removeEventListener('beforeunload', protect)
      if (latest.current.dirty) sessionDraft = { key: sessionKey, draft: latest.current.draft, file: latest.current.file, missingCover: latest.current.missingCover }
    }
  }, [sessionKey])
  const clearDraft = () => {
    latest.current.dirty = false; setDirty(false); setPending(undefined)
    if (sessionDraft?.key === sessionKey) sessionDraft = undefined
    try { removeExperienceRecovery(scope, key) } catch { setRecoveryMessage('本机草稿清除失败，请关闭恢复清除后重试。') }
  }
  const toggleRecovery = (enabled: boolean) => {
    if (!scope) { setRecoveryMessage('资料库尚未就绪，暂不能开启退出恢复。'); return }
    try { setExperienceRecovery(scope, enabled); setRecovery({ ...readExperienceRecovery(scope), error: '' }); if (!enabled) setPending(undefined); setRecoveryMessage(enabled ? '已开启本机文字草稿恢复。' : '已关闭恢复，并清除本资料库的本机草稿。') }
    catch { setRecoveryMessage('无法更新草稿恢复设置，请检查本机存储。') }
  }
  const restore = () => { if (!pending) return; setDraft(pending.draft); setDraftFile(undefined); setMissingCover(pending.coverNeedsReselect); setDirty(true); setPending(undefined); setRecoveryMessage(pending.coverNeedsReselect ? '文字已恢复，未保存的封面请重新选择。' : '文字已恢复，确认后再保存到经历册。') }
  const discardRecovered = () => { try { removeExperienceRecovery(scope, key); setPending(undefined); setRecoveryMessage('已丢弃旧草稿，当前输入保留。') } catch { setRecoveryMessage('旧草稿清除失败，请稍后重试。') } }
  return { draft, setDraft, file, setFile, dirty, setDirty, clearDraft, recoveryEnabled: recovery.enabled, recoveryFailed: Boolean(recovery.error), pending, recoveryMessage, toggleRecovery, restore, discardRecovered }
}
