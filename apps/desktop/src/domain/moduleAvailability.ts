import type { ModuleSetting } from './models'

const writingViews = ['writing', 'diary', 'people', 'places', 'timeline', 'assets']
export function moduleStatus(modules: ModuleSetting[], view: string) {
  const id = writingViews.includes(view) ? 'writing' : view
  const module = modules.find(item => item.id === id)
  return { enabled: module?.enabled ?? true, available: module?.available ?? true }
}
