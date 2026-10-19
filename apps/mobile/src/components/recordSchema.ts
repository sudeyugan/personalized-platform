import { categoryLabels, defaultTierLabels } from '../../../desktop/src/domain/experiences'
import { dayNumber } from '../../../desktop/src/modules/planner/plannerDates'
import { today } from '../data'
type Field = { key: string; label: string; type?: string; options?: [string, string][] }
export const mobileRecordFields: Record<string, Field[]> = {
  works: [
    { key: 'title', label: '作品名' },
    {
      key: 'kind',
      label: '作品类型',
      options: [
        ['memoir', '回忆录'],
        ['novel', '小说'],
        ['custom', '其他创作'],
      ],
    },
    { key: 'description', label: '关于这份作品', type: 'textarea' },
  ],
  questions: [
    { key: 'question', label: '今天的问题', type: 'textarea' },
    { key: 'background', label: '背景', type: 'textarea' },
    { key: 'followUp', label: '继续追问', type: 'textarea' },
  ],
  todos: [
    { key: 'title', label: '想做什么' },
    { key: 'dueDate', label: '日期（可选）', type: 'date' },
    {
      key: 'repeat',
      label: '重复',
      options: [
        ['none', '不重复'],
        ['daily', '每天'],
        ['weekdays', '工作日'],
        ['weekly', '每周'],
        ['quota', '周期次数'],
      ],
    },
    {
      key: 'priority',
      label: '优先级',
      options: [
        ['low', '不着急'],
        ['medium', '普通'],
        ['high', '重要'],
      ],
    },
    { key: 'note', label: '备注', type: 'textarea' },
  ],
  diary: [
    { key: 'title', label: '标题（可选）' },
    { key: 'content', label: '这一天', type: 'textarea' },
  ],
  people: [
    { key: 'name', label: '名字' },
    { key: 'summary', label: '印象', type: 'textarea' },
    { key: 'importantExperiences', label: '重要经历', type: 'textarea' },
  ],
  places: [
    { key: 'name', label: '地点名' },
    { key: 'region', label: '地区' },
    { key: 'address', label: '地址' },
    { key: 'relatedPeriod', label: '相关时期' },
    { key: 'description', label: '关于这里', type: 'textarea' },
  ],
  events: [
    { key: 'title', label: '事件' },
    { key: 'displayTime', label: '时间描述' },
    { key: 'startDate', label: '开始日期', type: 'date' },
    { key: 'endDate', label: '结束日期', type: 'date' },
    { key: 'description', label: '记下经过', type: 'textarea' },
  ],
  calendar: [
    { key: 'title', label: '安排' },
    { key: 'date', label: '日期', type: 'date' },
    { key: 'time', label: '时间（可选）', type: 'time' },
    { key: 'note', label: '备注', type: 'textarea' },
  ],
  courses: [
    { key: 'title', label: '课程' },
    {
      key: 'day',
      label: '星期',
      options: Array.from({ length: 7 }, (_, i) => [String(i + 1), `周${'一二三四五六日'[i]}`]),
    },
    {
      key: 'period',
      label: '课节',
      options: Array.from({ length: 6 }, (_, i) => [String(i + 1), `第 ${i + 1} 节`]),
    },
    { key: 'location', label: '教室' },
    { key: 'teacher', label: '老师' },
    { key: 'weeks', label: '周次，如 1-16、单周、双周' },
    { key: 'note', label: '备注', type: 'textarea' },
  ],
  experiences: [
    { key: 'title', label: '作品或足迹' },
    { key: 'category', label: '类别', options: Object.entries(categoryLabels) },
    { key: 'creator', label: '作者／创作者' },
    { key: 'dateText', label: '时间' },
    { key: 'tier', label: '偏爱程度', options: [['', '暂不排行'], ...Object.entries(defaultTierLabels)] },
    { key: 'note', label: '感想', type: 'textarea' },
  ],
  assignments: [
    { key: 'subject', label: '哪门课' },
    { key: 'note', label: '备注（可选）', type: 'textarea' },
  ],
}
export function newMobileRecord(collection: string, id: string): Record<string, unknown> {
  const now = new Date().toISOString()
  const base = { id, title: '', createdAt: now }
  switch (collection) {
    case 'works':
      return {
        ...base,
        kind: 'custom',
        description: '',
        chapterIds: [],
        volumeIds: [],
        targetWords: 0,
        updatedAt: now,
      }
    case 'questions':
      return {
        id,
        date: today(),
        question: '',
        background: '',
        followUp: '',
        topic: '',
        tone: 'balanced',
        createdAt: now,
      }
    case 'diary':
      return { date: id, title: '', content: '', updatedAt: now }
    case 'todos':
      return { ...base, note: '', priority: 'medium', repeat: 'none', completed: false }
    case 'courses':
      return {
        id,
        title: '',
        day: dayNumber(today()),
        period: 1,
        teacher: '',
        location: '',
        weeks: '1-16',
        note: '',
      }
    case 'calendar':
      return { id, title: '', date: today(), note: '' }
    case 'people':
      return {
        id,
        name: '',
        summary: '',
        importantExperiences: '',
        aliases: [],
        tags: [],
        chapterIds: [],
        customFields: [],
        usage: 'real',
      }
    case 'places':
      return {
        id,
        name: '',
        region: '',
        address: '',
        relatedPeriod: '',
        description: '',
        aliases: [],
        tags: [],
        chapterIds: [],
        customFields: [],
        usage: 'real',
      }
    case 'events':
      return {
        id,
        title: '',
        displayTime: '',
        precision: 'unknown',
        description: '',
        chapterIds: [],
        manualOrder: 0,
        customFields: [],
        usage: 'real',
      }
    case 'experiences':
      return {
        ...base,
        category: 'novel',
        creator: '',
        dateText: '',
        note: '',
        paperStyle: 'linen',
        order: Date.now(),
        updatedAt: now,
      }
    case 'assignments':
      return { ...base, subject: '', note: '', rules: [], periods: {} }
    default:
      throw new Error('这个页面尚未提供编辑，原资料没有改变。')
  }
}
