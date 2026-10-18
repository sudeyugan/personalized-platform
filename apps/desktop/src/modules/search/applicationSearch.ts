import type { LibraryData, ViewId } from '../../domain/models'
import { navigationItems } from '../../app/moduleManifest'
import { moduleStatus } from '../../domain/moduleAvailability'

export interface ApplicationSearchHit {
  id: string; group: string; title: string; excerpt: string; view: ViewId
  targetId?: string; destination?: string; date?: string; section?: string
}

export function searchViewEnabled(data: LibraryData, view: ViewId) {
  const status = moduleStatus(data.settings.modules, view)
  return status.enabled && status.available
}

export function searchApplication(data: LibraryData, query: string): ApplicationSearchHit[] {
  const needle = query.trim().toLocaleLowerCase().slice(0, 200)
  if (!needle) return []
  const tokens = needle.split(/\s+/)
  const results: (ApplicationSearchHit & { score: number })[] = []
  const accessibleWork = (id?: string) => !id || data.works.some(work => work.id === id && !work.deletedAt && !work.locked)
  const add = (hit: ApplicationSearchHit, text = hit.title) => {
    if (!searchViewEnabled(data, hit.view)) return
    const searchable = `${hit.title}\n${text}`.toLocaleLowerCase()
    if (!tokens.every(token => searchable.includes(token))) return
    const offset = Math.max(0, text.toLocaleLowerCase().indexOf(tokens[0]) - 25)
    results.push({ ...hit, excerpt: text.slice(offset, offset + 100).replace(/\s+/g, ' '), score: hit.title.toLocaleLowerCase() === needle ? 2 : hit.title.toLocaleLowerCase().includes(needle) ? 1 : 0 })
  }
  for (const work of data.works) if (accessibleWork(work.id)) add({ id: `work:${work.id}`, group: '作品', title: work.title, excerpt: '', view: 'writing', targetId: work.id }, work.description)
  for (const chapter of Object.values(data.chapters)) if (!chapter.deletedAt && accessibleWork(chapter.workId)) add({ id: `chapter:${chapter.id}`, group: '章节', title: chapter.title, excerpt: '', view: 'writing', destination: 'writing.chapter', targetId: chapter.id }, `${chapter.summary ?? ''}\n${chapter.plainText}`)
  for (const diary of data.planner.diaryEntries) add({ id: `diary:${diary.date}`, group: '日记', title: diary.title || diary.date, excerpt: '', view: 'diary', destination: 'diary.day', date: diary.date }, `${diary.date}\n${diary.content}`)
  for (const idea of data.ideas?.sessions ?? []) if (!idea.deletedAt) add({ id: `idea:${idea.id}`, group: '想法手稿', title: idea.title, excerpt: '', view: 'ideas', destination: 'ideas', targetId: idea.id }, `${idea.seed}\n${idea.draft}`)
  for (const entry of data.experiences?.entries ?? []) if (!entry.deletedAt) add({ id: `experience:${entry.id}`, group: entry.category === 'place' ? '足迹' : '经历作品', title: entry.title, excerpt: '', view: 'experiences', destination: 'experiences', targetId: entry.id }, `${entry.creator}\n${entry.dateText}\n${entry.note}`)
  for (const todo of data.planner.todos) add({ id: `todo:${todo.id}`, group: '待办', title: todo.title, excerpt: '', view: 'todos', destination: 'todos', targetId: todo.id }, `${todo.note}\n${todo.dueDate ?? ''}`)
  for (const assignment of data.planner.assignments ?? []) if (!assignment.deletedAt) add({ id: `assignment:${assignment.id}`, group: '作业', title: assignment.title, excerpt: '', view: 'todos', destination: 'todos', section: 'assignments', targetId: assignment.id }, [assignment.subject, assignment.note, ...assignment.rules.map(rule => `${rule.startDate} ${rule.endDate ?? ''} ${rule.time ?? ''} ${rule.repeat === 'weekly' ? `每周 ${rule.weekdays.join(' ')}` : '单次'}`), ...Object.values(assignment.periods).map(period => `${period.date ?? ''} ${period.time ?? ''}`)].join('\n'))
  for (const event of data.planner.calendarEvents) add({ id: `calendar:${event.id}`, group: '日历事务', title: event.title, excerpt: '', view: 'calendar', destination: 'calendar.day', targetId: event.id, date: event.date }, `${event.date} ${event.time ?? ''}\n${event.note ?? ''}`)
  for (const course of data.planner.courses) add({ id: `course:${course.id}`, group: '课表', title: course.title, excerpt: '', view: 'calendar', destination: 'calendar.schedule', targetId: course.id }, `${course.teacher}\n${course.location}\n${course.note}`)
  for (const person of data.people) if (!person.deletedAt && accessibleWork(person.workId)) add({ id: `person:${person.id}`, group: '人物', title: person.name, excerpt: '', view: 'people', destination: 'record.person', targetId: person.id }, [person.summary, person.importantExperiences, ...person.aliases, ...person.tags, ...person.customFields.map(field => `${field.label} ${field.value}`)].join('\n'))
  for (const place of data.places) if (!place.deletedAt && accessibleWork(place.workId)) add({ id: `place:${place.id}`, group: '地点', title: place.name, excerpt: '', view: 'places', destination: 'record.place', targetId: place.id }, [place.description, place.region, place.address, ...place.aliases, ...place.tags, ...place.customFields.map(field => `${field.label} ${field.value}`)].join('\n'))
  for (const event of data.events) if (!event.deletedAt && accessibleWork(event.workId)) add({ id: `event:${event.id}`, group: '时间线', title: event.title, excerpt: '', view: 'timeline', destination: 'record.timeline', targetId: event.id }, `${event.displayTime}\n${event.description}`)
  for (const asset of data.assets) if (!asset.deletedAt && (!asset.purpose || asset.purpose === 'creative') && accessibleWork(asset.workId)) add({ id: `asset:${asset.id}`, group: '素材', title: asset.fileName, excerpt: '', view: 'assets', targetId: asset.id }, `${asset.alt ?? ''}\n${asset.caption ?? ''}`)
  for (const track of data.tracks) if (!track.deletedAt) add({ id: `track:${track.id}`, group: '音乐', title: track.title, excerpt: '', view: 'music', targetId: track.id }, `${track.artist}\n${track.fileName}`)
  for (const mood of data.planner.moodEntries) if (mood.note) add({ id: `mood:${mood.id}`, group: '心情备注', title: `${mood.date} 心情`, excerpt: '', view: 'home', destination: 'mood.reflection', date: mood.date }, mood.note)
  for (const question of data.planner.dailyQuestions) add({ id: `question:${question.id}`, group: '朝问', title: question.question, excerpt: '', view: 'diary', destination: 'diary.day', date: question.date, targetId: question.id, section: 'daily-question' }, `${question.topic}\n${question.background}\n${question.followUp}`)
  for (const favorite of data.answerBook.favorites) add({ id: `answer:${favorite.id}`, group: '答案收藏', title: favorite.question || favorite.answer, excerpt: '', view: 'answerBook', destination: 'answer_book', targetId: favorite.id }, favorite.answer)
  for (const [section, title, keywords] of [
    ['appearance', '外观与写作', '主题 背景 字体 书写习惯'], ['desktop', '桌面伙伴', '桌宠 WebM 心率'],
    ['intelligence', 'AI 伙伴', '小鱼 能力 权限 模型 语音 记忆'], ['modules', '功能与导航', '模块 开关 入口顺序'],
    ['data', '数据管理', '备份 恢复 导入 导出 迁移'], ['privacy', '隐私与安全', '外发 加密 解锁 授权'],
  ]) add({ id: `setting:${section}`, group: '设置入口', title, excerpt: '', view: 'settings', destination: 'settings', section }, keywords)
  for (const item of navigationItems) add({ id: `page:${item.id}`, group: '功能入口', title: item.label, excerpt: '', view: item.id }, item.caption)
  const counts = new Map<string, number>()
  return results.sort((a, b) => b.score - a.score).filter(hit => { const count = counts.get(hit.group) ?? 0; counts.set(hit.group, count + 1); return count < 8 }).map(({ score: _score, ...hit }) => hit)
}
