import type { OperationDraft } from '../../../domain/operations/types'
import { cueLabels, type BrowserRecording } from './types'
export function recordingDraft(record:BrowserRecording, goal:string):OperationDraft {
  return {
    title:goal.trim().slice(0,80),goal:`${goal.trim()}；网站 ${record.origin}`,scope:'browser',applicability:`只在用户已授权的 ${record.origin} 执行；对象或账号不明确时询问，不遍历其他网站。`,keywords:[goal.trim().slice(0,40)],
    preconditions:'重新检查网站、登录状态与当前页面；方法不授予导航、登录、发送或删除权限。',
    steps:[`准备当前授权网站 ${record.origin} 并观察现场控件`,...record.events.map(cue=>cueLabels[cue])],
    completion:'在当前页面取得与任务目标相符的明确状态和证据再报告；打开网页、完成登录或点击按钮都不算任务完成。',
    recovery:'控件不明确、权限不足、验证码或结果不明时停下询问；不重复未知写入，不选择其他账号，不重放历史坐标或控件引用。',
  }
}
