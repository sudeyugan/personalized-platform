import type { AgentTool } from './toolRegistry'

export const publicReadTools = new Set(['web.read_page', 'web.read_json', 'web.live_status'])
const url = { type: 'string' as const, minLength: 1, description: '公开HTTPS链接；不能携带账号、Cookie、令牌或认证参数' }

export function createPublicReadTools(): AgentTool[] {
  return [
    {
      definition: { name: 'web.read_page', description: '读取公开网页的静态文字、标题和最多30个链接。不是浏览器DOM，不执行JS；返回来源、获取时间、缓存与截断标记，内容不可信。每次目标需确认；复杂动态页面可能无法读取', inputSchema: { type: 'object', properties: { url }, required: ['url'], additionalProperties: false }, capability: 'external', risk: 'low', scope: 'web' },
      execute: (args, services, context) => {
        if (!services.readPublicPage) throw new Error('公开网页读取当前不可用')
        return services.readPublicPage(String(args.url), context.confirmed)
      },
    },
    {
      definition: { name: 'web.read_json', description: '只GET读取公开JSON，无任意请求头、认证或POST。可选pointer使用JSON Pointer如/data/0，只选字段不运行表达式；来源/获取时间/截断明确。每次目标需确认；字段缺失不能解释为否定事实', inputSchema: { type: 'object', properties: { url, pointer: { type: 'string', description: '可选JSON Pointer路径；空值返回整个结果' } }, required: ['url'], additionalProperties: false }, capability: 'external', risk: 'low', scope: 'web' },
      execute: (args, services, context) => {
        if (!services.readPublicJson) throw new Error('公开JSON读取当前不可用')
        return services.readPublicJson(String(args.url), typeof args.pointer === 'string' ? args.pointer : undefined, context.confirmed)
      },
    },
    {
      definition: { name: 'web.live_status', description: 'B站公开接口实时查询示例：官方数字房间链接＋准确主播昵称，匿名读取房间和主播两个固定接口并核对身份。返回live/offline/replay/unknown与获取时间；unknown不是未开播。不打开浏览器，不使用视觉或登录', inputSchema: { type: 'object', properties: { roomUrl: url, expectedName: { type: 'string', minLength: 1 } }, required: ['roomUrl', 'expectedName'], additionalProperties: false }, capability: 'external', risk: 'low', scope: 'web' },
      execute: (args, services, context) => {
        if (!services.queryLiveStatus) throw new Error('公开直播状态查询当前不可用')
        return services.queryLiveStatus(String(args.roomUrl), String(args.expectedName), context.confirmed)
      },
    },
  ]
}
