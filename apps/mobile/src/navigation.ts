export const mainPages = ['home', 'journal', 'chat'] as const
export const secondaryPages = [
  'planner',
  'todos',
  'assignments',
  'calendar',
  'courses',
  'diary',
  'moods',
  'ideas',
  'settings',
] as const
export function mobilePage(value: string): string {
  return [...mainPages, ...secondaryPages].some((page) => page === value) ? value : 'home'
}
export function parentPage(page: string) {
  return ['diary', 'moods', 'ideas'].includes(page) ? 'journal' : 'home'
}
export function sectionPage(page: string) {
  return mainPages.some((item) => item === page) ? page : parentPage(page)
}
export const pageLabels: Record<string, string> = {
  home: '今日',
  journal: '手记',
  chat: '小鱼',
  planner: '日常安排',
  todos: '待办',
  assignments: '作业',
  calendar: '日历',
  courses: '课表',
  diary: '日记',
  moods: '心情与回望',
  ideas: '想法工坊',
  settings: '连接与设置',
}
