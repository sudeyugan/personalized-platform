import type { LucideIcon } from 'lucide-react'
import { BookOpenText, CalendarDays, CheckSquare2, CircleHelp, Headphones, Home, Images, MapPinned, Settings, Sparkles, UsersRound } from 'lucide-react'
import type { ViewId } from '../domain/models'
import { t } from '../i18n/zh-CN'

export interface NavigationItem {
  id: ViewId
  label: string
  caption?: string
  icon: LucideIcon
  group: 'main' | 'writing' | 'system'
}

export const navigationItems: NavigationItem[] = [
  { id: 'home', label: t('nav.home'), caption: t('nav.home.caption'), icon: Home, group: 'main' },
  { id: 'journal', label: t('nav.journal'), caption: t('nav.journal.caption'), icon: CalendarDays, group: 'main' },
  { id: 'todos', label: t('nav.todos'), caption: t('nav.todos.caption'), icon: CheckSquare2, group: 'main' },
  { id: 'writing', label: t('nav.writing'), caption: t('nav.writing.caption'), icon: BookOpenText, group: 'writing' },
  { id: 'people', label: t('nav.people'), caption: t('nav.people.caption'), icon: UsersRound, group: 'writing' },
  { id: 'places', label: t('nav.places'), caption: t('nav.places.caption'), icon: MapPinned, group: 'writing' },
  { id: 'timeline', label: t('nav.timeline'), caption: t('nav.timeline.caption'), icon: Sparkles, group: 'writing' },
  { id: 'assets', label: t('nav.assets'), caption: t('nav.assets.caption'), icon: Images, group: 'writing' },
  { id: 'music', label: t('nav.music'), caption: t('nav.music.caption'), icon: Headphones, group: 'main' },
  { id: 'help', label: t('nav.help'), caption: t('nav.help.caption'), icon: CircleHelp, group: 'system' },
  { id: 'settings', label: t('nav.settings'), caption: t('nav.settings.caption'), icon: Settings, group: 'system' },
]
