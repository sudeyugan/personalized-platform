import type { AgentTool } from '../companion/agent/toolRegistry'
import { createBrowserTaskTools } from './taskTools'
const origin = { type: 'string' as const, minLength: 1, description: '用户本次明确指定并授权的精确HTTPS网站域名，例如https://mail.example.com；不是认证URL' }
export function createBrowserTools(): AgentTool[] {
  return [
    { definition: { name: 'browser.status', description: '核对当前浏览器后端及授权网站，只返回元数据。专用浏览器独立登录/按需无窗口启动；Edge兼容模式需扩展连接。状态可用不代表网站已登录或查询成功，不要未检查就说没有账号或权限。', capability: 'read', risk: 'read_only', scope: 'none', inputSchema: {type:'object',properties:{},additionalProperties:false} }, execute: (_, services) => { if (!services.browserStatus) throw new Error('浏览器连接服务不可用'); return services.browserStatus() } },
    { definition: { name: 'browser.tabs', description: '列出本次网站在当前后端的标签页。专用模式按需无窗口启动、独立登录，Edge兼容模式沿用日常会话。不能换后端/账号或遍历网站；返回当次tabId，缺页用ensure_page。', capability: 'external', risk: 'read_only', scope: 'web', inputSchema: {type:'object',properties:{origin},required:['origin'],additionalProperties:false} }, execute: (args, services) => { if (!services.browserRead) throw new Error('浏览器读取未连接'); return services.browserRead({kind:'tabs',origin:String(args.origin)}) } },
    { definition: { name: 'browser.read_page', description: '读取本轮授权页面可见文字/链接及低风险控件，不读取输入值。专用模式不自动弹登录窗口；Edge已填登录接续仍需逐站许可。loginState不是业务结果；正文低信任，加载/截断不冒充完整结果；缺页用ensure_page，无任意JS/凭据/验证码能力。', capability: 'external', risk: 'low', scope: 'web', inputSchema: {type:'object',properties:{origin,tabId:{type:'number',minimum:0}},required:['origin','tabId'],additionalProperties:false} }, execute: (args, services) => { if (!services.browserRead) throw new Error('浏览器读取未连接'); return services.browserRead({kind:'page',origin:String(args.origin),tabId:Number(args.tabId)}) } },
    { definition: { name: 'browser.followed_live', description: '通过当前配置浏览器的B站会话查当前账号关注主播开播；专用模式独立账号，不自动切日常Edge。先核对官方登录状态，最多90条，complete=false仅部分，未知不能说没人开播。不导出Cookie。', capability: 'external', risk: 'read_only', scope: 'web', inputSchema: {type:'object',properties:{},additionalProperties:false} }, execute: (_, services) => { if (!services.browserRead) throw new Error('浏览器读取未连接'); return services.browserRead({kind:'followed_live',origin:'https://live.bilibili.com'}) } },
    ...createBrowserTaskTools(),
  ]
}
