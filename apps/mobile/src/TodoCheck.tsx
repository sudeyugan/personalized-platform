import { useEffect, useState } from 'react'
import { modify } from './repository'
import { today, toggleTodo } from './data'
import { isTodoCompletedOn, quotaTodoProgress } from '../../desktop/src/modules/planner/plannerDates'
import type { TodoItem } from '../../desktop/src/domain/models'

export function TodoCheck({
  recordKey,
  value,
  disabled,
}: {
  recordKey: string
  value: Record<string, unknown>
  disabled: boolean
}) {
  const todo = value as unknown as TodoItem
  const completed = isTodoCompletedOn(todo, today())
  const [checked, setChecked] = useState(completed)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!saving) setChecked(completed)
  }, [completed, saving])
  return (
    <>
      <input
        aria-label="完成待办"
        type="checkbox"
        checked={checked}
        disabled={disabled || saving}
        onChange={(event) => {
          const next = event.currentTarget.checked
          setChecked(next)
          setSaving(true)
          setError('')
          void modify(
            recordKey,
            (current) =>
              toggleTodo(current as unknown as TodoItem, today()) as unknown as Record<string, unknown>,
          )
            .catch((cause) => {
              setChecked(completed)
              setError(cause instanceof Error ? cause.message : '未能保存，请重试。')
            })
            .finally(() => setSaving(false))
        }}
      />
      {todo.repeat === 'quota' && (
        <small>
          {quotaTodoProgress(todo).count}/{quotaTodoProgress(todo).target}
        </small>
      )}
      {error && <small role="alert">{error}</small>}
    </>
  )
}
