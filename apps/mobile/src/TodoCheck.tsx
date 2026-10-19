import { useEffect, useState } from 'react'
import { update } from './repository'

export function TodoCheck({ recordKey, value, disabled }: { recordKey: string; value: Record<string, unknown>; disabled: boolean }) {
  const [checked, setChecked] = useState(Boolean(value.completed))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (!saving) setChecked(Boolean(value.completed)) }, [value.completed, saving])
  return <><input aria-label="完成待办" type="checkbox" checked={checked} disabled={disabled || saving} onChange={event => {
    const next = event.currentTarget.checked
    setChecked(next); setSaving(true); setError('')
    void update(recordKey, { ...value, completed: next }).catch(cause => {
      setChecked(Boolean(value.completed)); setError(cause instanceof Error ? cause.message : '未能保存，请重试。')
    }).finally(() => setSaving(false))
  }}/>{error && <small role="alert">{error}</small>}</>
}
