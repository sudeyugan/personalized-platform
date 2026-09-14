import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'

interface Field {
  key: string
  label: string
  value: string
  multiline?: boolean
  placeholder?: string
}

export function EditRecordDialog({ title, fields, onClose, onSave }: { title: string; fields: Field[]; onClose: () => void; onSave: (values: Record<string, string>) => void }) {
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((field) => [field.key, field.value])))
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!fields.every((field) => field.key !== 'name' && field.key !== 'title' || values[field.key]?.trim())) return
    onSave(values)
  }

  return (
    <div className="edit-modal" onMouseDown={onClose}>
      <form onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <header><div><small>创作资料</small><h2>{title}</h2></div><button type="button" aria-label="关闭编辑" onClick={onClose}><X size={18} /></button></header>
        <div className="edit-fields">{fields.map((field) => <label key={field.key}><span>{field.label}</span>{field.multiline ? <textarea rows={4} value={values[field.key] ?? ''} placeholder={field.placeholder} onChange={(event) => setValues({ ...values, [field.key]: event.target.value })} /> : <input value={values[field.key] ?? ''} placeholder={field.placeholder} onChange={(event) => setValues({ ...values, [field.key]: event.target.value })} />}</label>)}</div>
        <footer><button type="button" className="ghost-button" onClick={onClose}>取消</button><button className="primary-button" type="submit">保存修改</button></footer>
      </form>
    </div>
  )
}
