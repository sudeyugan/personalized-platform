import { invoke } from '@tauri-apps/api/core'

export interface ImpressionRequest { chapterId: string; sourceRevision: number; sourcePreview: string; prompt: string; stylePreset: string }
export interface ImpressionCandidate { id: string; previewUrl: string; mimeType: 'image/svg+xml' }
export interface AiProvider { id: string; testConnection(): Promise<string>; generate(request: ImpressionRequest): Promise<ImpressionCandidate[]> }

const isTauriRuntime = () => '__TAURI_INTERNALS__' in window

function svgCandidate(request: ImpressionRequest, index: number) {
  const palettes = [['#eee0cf', '#8c6555'], ['#dce8e5', '#51706a'], ['#e7dfeb', '#6f5a78']]
  const [background, ink] = palettes[index % palettes.length]
  const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="640"><rect width="100%" height="100%" fill="${background}"/><circle cx="${250 + index * 180}" cy="250" r="150" fill="${ink}" opacity=".14"/><path d="M80 500 Q320 ${250 + index * 40} 560 480 T980 390" fill="none" stroke="${ink}" stroke-width="18" opacity=".35"/><text x="72" y="92" fill="${ink}" font-size="30" font-family="serif">${escape(request.stylePreset)}</text><text x="72" y="560" fill="${ink}" font-size="23" font-family="serif">${escape(request.prompt.slice(0, 28))}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

class MockProvider implements AiProvider {
  id = 'mock'
  async testConnection() { return '本地 Mock Provider 可用，不会发送网络请求。' }
  async generate(request: ImpressionRequest) {
    if (request.prompt.includes('[network-error]')) throw new Error('NETWORK_ERROR:模拟网络不可用')
    if (request.prompt.includes('[quota-error]')) throw new Error('QUOTA_ERROR:模拟配额耗尽')
    if (request.prompt.includes('[reject]')) throw new Error('CONTENT_REJECTED:模拟内容拒绝')
    await new Promise((resolve) => setTimeout(resolve, 180))
    return [0, 1, 2].map((index) => ({ id: `candidate-${crypto.randomUUID()}`, previewUrl: svgCandidate(request, index), mimeType: 'image/svg+xml' as const }))
  }
}

class UnconfiguredProvider implements AiProvider {
  id: 'openrouter' | 'custom'
  private endpoint: string
  private model: string
  constructor(id: 'openrouter' | 'custom', endpoint: string, model: string) { this.id = id; this.endpoint = endpoint; this.model = model }
  async testConnection() {
    if (!this.endpoint.startsWith('https://')) throw new Error('自定义 Provider 必须使用 HTTPS 地址')
    const hasKey = isTauriRuntime() ? await invoke<boolean>('has_secret', { id: 'ai-provider' }) : Boolean(sessionStorage.getItem('yiyu.ai.key'))
    if (!hasKey) throw new Error('请先安全保存 API Key')
    return `${this.id === 'openrouter' ? 'OpenRouter' : '自定义 Provider'} 配置已就绪：${this.model || '未命名模型'}。实际请求将在图像协议接入后开放。`
  }
  async generate(_request: ImpressionRequest): Promise<ImpressionCandidate[]> { throw new Error('PROVIDER_PROTOCOL_UNCONFIGURED:尚未选择兼容的绘图服务协议，请使用 Mock Provider 验证流程') }
}

export function createAiProvider(config: { providerId: 'mock' | 'openrouter' | 'custom'; endpoint: string; model: string }): AiProvider { return config.providerId === 'mock' ? new MockProvider() : new UnconfiguredProvider(config.providerId, config.endpoint, config.model) }
export async function storeAiKey(secret: string) { if (isTauriRuntime()) await invoke('store_secret', { id: 'ai-provider', secret }); else sessionStorage.setItem('yiyu.ai.key', secret) }
export async function deleteAiKey() { if (isTauriRuntime()) await invoke('delete_secret', { id: 'ai-provider' }); else sessionStorage.removeItem('yiyu.ai.key') }
export async function hasAiKey() { return isTauriRuntime() ? invoke<boolean>('has_secret', { id: 'ai-provider' }) : Boolean(sessionStorage.getItem('yiyu.ai.key')) }
