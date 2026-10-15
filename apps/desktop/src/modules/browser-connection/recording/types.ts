export const cueLabels = {
  inbox: '打开收件箱', unread: '查看未读', all: '查看全部', notifications: '查看通知', updates: '查看动态', following: '打开关注列表', next: '进入下一页', previous: '返回上一页', refresh: '刷新当前页面',
  search: '在站内搜索本次 {{关键词}}', manual_auth: '需要时由用户完成登录或验证，不读取或填写凭据', navigation: '等待同网站页面跳转完成后重新观察',
  unknown_button: '点击按钮（名称未保存，请补充操作目的）', unknown_tab: '切换页签（名称未保存，请补充操作目的）',
} as const
export type RecordingCue = keyof typeof cueLabels
export interface BrowserRecording { id:string; origin:string; tabId:number; phase:'recording'|'paused'|'review'; events:RecordingCue[]; remainingSeconds:number }
export interface RecordingTab { tabId:number; origin:string; title:string; url:string }
