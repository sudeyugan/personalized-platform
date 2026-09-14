import { ChevronDown } from 'lucide-react'
import { useState, type ReactNode } from 'react'

interface Props { id: string; title: string; description: string; icon: ReactNode; defaultOpen?: boolean; children: ReactNode }

export function SettingsCategory({ id, title, description, icon, defaultOpen = false, children }: Props) {
  const storageKey = `yiyu.settings.category.${id}`
  const [open, setOpen] = useState(() => {
    const stored = localStorage.getItem(storageKey)
    return stored === null ? defaultOpen : stored === 'open'
  })
  const toggle = () => setOpen((current) => {
    const next = !current
    localStorage.setItem(storageKey, next ? 'open' : 'closed')
    return next
  })

  return <section className={open ? 'settings-category open' : 'settings-category'}>
    <button className="settings-category-toggle" type="button" aria-expanded={open} aria-controls={`settings-category-${id}`} onClick={toggle}>
      <span className="settings-category-icon">{icon}</span>
      <span><strong>{title}</strong><small>{description}</small></span>
      <ChevronDown className="settings-category-chevron" size={18} />
    </button>
    {open && <div className="settings-category-content" id={`settings-category-${id}`}>{children}</div>}
  </section>
}
