import { Check, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'

export interface InlineField {
  key: string
  label: string
  value: string
  multiline?: boolean
  placeholder?: string
  options?: { value: string; label: string }[]
}

export function InlineRecordEditor({ fields, onCancel, onSave }: { fields: InlineField[]; onCancel: () => void; onSave: (values: Record<string, string>) => void }) {
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((field) => [field.key, field.value])))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!fields.every((field) => field.key !== 'name' && field.key !== 'title' || values[field.key]?.trim())) return
    onSave(values)
  }

  return (
    <form className="inline-record-editor" onSubmit={submit}>
      <div className="inline-edit-fields">
        {fields.map((field, index) => (
          <label key={field.key}>
            <span>{field.label}</span>
            {field.options
              ? <select value={values[field.key] ?? ''} onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}>{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
              : field.multiline
              ? <textarea rows={3} value={values[field.key] ?? ''} placeholder={field.placeholder} onChange={(event) => setValues({ ...values, [field.key]: event.target.value })} />
              : <input autoFocus={index === 0} value={values[field.key] ?? ''} placeholder={field.placeholder} onChange={(event) => setValues({ ...values, [field.key]: event.target.value })} />}
          </label>
        ))}
      </div>
      <div className="inline-edit-actions">
        <button type="button" className="ghost-button" onClick={onCancel}><X size={14} />取消</button>
        <button type="submit" className="primary-button"><Check size={14} />保存</button>
      </div>
    </form>
  )
}
