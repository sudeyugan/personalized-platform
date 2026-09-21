const messages = {
  'nav.home': '今日一隅', 'nav.home.caption': '回到你的空间',
  'nav.answerBook': '答案之书', 'nav.answerBook.caption': '把问题交给偶然',
  'nav.calendar': '日历与课表', 'nav.calendar.caption': '安排日期与每周课程',
  'nav.diary': '日记', 'nav.diary.caption': '为每一天留下文字',
  'nav.todos': '待办', 'nav.todos.caption': '整理要完成的事情',
  'nav.writing': '写作', 'nav.writing.caption': '作品与章节',
  'nav.people': '人物', 'nav.people.caption': '故事中的人',
  'nav.places': '地点', 'nav.places.caption': '记忆发生之处',
  'nav.timeline': '时间线', 'nav.timeline.caption': '沿着时间回望',
  'nav.assets': '素材库', 'nav.assets.caption': '图片与章节印象',
  'nav.music': '音乐', 'nav.music.caption': '写作时的声音',
  'nav.help': '帮助中心', 'nav.help.caption': '指南与脱敏诊断',
  'nav.settings': '设置', 'nav.settings.caption': '外观与数据',
} as const

export type MessageKey = keyof typeof messages
export function t(key: MessageKey) { return messages[key] }

// M3 资料领域文案集中在这里，后续接入多语言时无需再扫描组件。
export const recordText = {
  library: '创作资料',
  people: '人物',
  places: '地点',
  timeline: '人生时间线',
  newPerson: '新建人物',
  newPlace: '新建地点',
  newEvent: '记录事件',
  personDescription: '记录别名、关系、经历，并从章节看到双向引用。',
  placeDescription: '保存区域、地址、相关时段与故事发生的位置。',
  timelineTitle: '沿着时间，慢慢回望',
  timelineDescription: '支持确切日期、月份、年份、大约时间和未知时间，并保留你的原始写法。',
  recycleBin: '资料回收站',
  eventRecycleBin: '事件回收站',
  restore: '恢复',
  permanentDelete: '永久删除',
  references: '处引用',
  precisionOptions: [
    { value: 'exact', label: '确切日期' },
    { value: 'month', label: '月份' },
    { value: 'year', label: '年份' },
    { value: 'approximate', label: '大约时间' },
    { value: 'unknown', label: '未知' },
  ],
} as const
