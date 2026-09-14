export interface CompanionRequest { message: string; context: string; companionName: string }
export interface CompanionProvider { reply(request: CompanionRequest): Promise<string>; testConnection(): Promise<string> }

class MockCompanion implements CompanionProvider {
  async testConnection() { return '本地伙伴 Mock 可用，不会发送网络请求。' }
  async reply(request: CompanionRequest) {
    if (request.message.includes('[network-error]')) throw new Error('NETWORK_ERROR:模拟网络不可用')
    const contextHint = request.context ? '我看到了你允许我阅读的这一小部分。' : '这次我没有读取任何文稿资料。'
    return `${contextHint} ${request.message.length > 24 ? '你写下的内容很有分量，我们可以慢一点梳理。' : '我在这里，愿意听你继续说。'}`
  }
}
class CustomCompanion implements CompanionProvider {
  private endpoint: string
  private model: string
  constructor(endpoint: string, model: string) { this.endpoint = endpoint; this.model = model }
  async testConnection() { if (!this.endpoint.startsWith('https://')) throw new Error('伙伴 Provider 必须使用 HTTPS'); return `配置已就绪：${this.model || '未命名模型'}。协议确认前不会发送内容。` }
  async reply(_request: CompanionRequest): Promise<string> { throw new Error('PROVIDER_PROTOCOL_UNCONFIGURED:尚未选择兼容的对话协议，请先使用本地 Mock') }
}
export function createCompanionProvider(config: { providerId: 'mock' | 'custom'; endpoint: string; model: string }) { return config.providerId === 'mock' ? new MockCompanion() : new CustomCompanion(config.endpoint, config.model) }
