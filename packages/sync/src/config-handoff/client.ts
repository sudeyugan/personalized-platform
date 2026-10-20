import type { SyncConfig, Transport } from '../types'
import { configLocal } from './storage'
import {
  configContext,
  publicScope,
  requestCode,
  signConfig,
  validatePacket,
  validateRequest,
  verifyConfig,
  type ConfigChannel,
  type ConfigPacket,
  type ConfigRequest,
  type ConfigScope,
  type PublicConfig,
  type Signed,
} from './protocol'

export interface ConfigNative {
  authorize(request: ConfigRequest): Promise<void>
  revoke(request: ConfigRequest): Promise<void>
  identity(): Promise<string>
  seal(
    publicKey: string,
    context: string,
    config: PublicConfig,
  ): Promise<Pick<ConfigPacket, 'ephemeral' | 'iv' | 'body'>>
  apply(context: string, packet: ConfigPacket): Promise<PublicConfig>
  detach(): Promise<void>
  available(): Promise<PublicConfig>
  applyPublic(config: PublicConfig): Promise<void>
  state(): Promise<{ request?: string; detached?: boolean; sequence?: number }>
}
interface Local {
  incoming?: {
    request: Signed<ConfigRequest>
    source?: string
    sequence: number
    stopped?: boolean
    applied?: PublicConfig
    submitted?: boolean
  }
  approvals: Record<
    string,
    { request: Signed<ConfigRequest>; sequence: number; onceDone?: boolean; revision?: string }
  >
}
export class ConfigHandoff {
  private busy = false
  private closed = false
  private pending: ConfigChannel[] = []
  private config: SyncConfig
  private transport: Transport
  private native: ConfigNative
  private active: () => boolean
  constructor(
    config: SyncConfig,
    transport: Transport,
    native: ConfigNative,
    active: () => boolean = () => true,
  ) {
    this.config = config
    this.transport = transport
    this.native = native
    this.active = active
  }
  close() {
    this.closed = true
  }
  private guard() {
    if (this.closed || !this.active()) throw new Error('本次连接已停止配置交接。')
  }
  private key() {
    return `${this.config.space}/${this.config.device}`
  }
  private async load(): Promise<Local> {
    return (await configLocal<Local>(this.key())) ?? { approvals: {} }
  }
  private save(local: Local) {
    return configLocal(this.key(), local)
  }
  private call(operation: string, body: object = {}) {
    this.guard()
    return this.transport(this.config.url, '/v1/config', this.config.token, { operation, ...body })
  }
  async request(scopes: ConfigScope[], follow: boolean) {
    this.guard()
    if (this.busy) throw new Error('请等待当前交接完成。')
    this.busy = true
    try {
      const local = await this.load()
      if (local.incoming && !local.incoming.stopped)
        throw new Error('已有交接请求；请先停止跟随，再重新选择。')
      // Retrying a previously failed cancellation must precede a new request.
      if (local.incoming) await this.call('cancel', { id: local.incoming.request.value.id })
      const request: ConfigRequest = {
        v: 1,
        id: crypto.randomUUID(),
        space: this.config.space,
        target: this.config.device,
        name: this.config.name.slice(0, 60),
        publicKey: await this.native.identity(),
        scopes,
        follow,
        expires: Date.now() + 600000,
      }
      validateRequest(request)
      const signed = await signConfig('request', request, this.config.key)
      // Persist BEFORE consuming network state; a lost response is retried with this exact request.
      local.incoming = { request: signed, sequence: 0 }
      await this.save(local)
      await this.call('request', { request: signed })
      local.incoming.submitted = true
      await this.save(local)
    } finally {
      this.busy = false
    }
  }
  async status() {
    const local = await this.load()
    return {
      incoming: local.incoming,
      code: local.incoming ? await requestCode(local.incoming.request.value) : '',
      approvals: Object.values(local.approvals).filter((item) => !item.onceDone).length,
    }
  }
  async stop() {
    if (this.busy) throw new Error('请等待当前交接完成。')
    this.busy = true
    try {
      const local = await this.load()
      if (local.incoming) local.incoming.stopped = true
      // Local refusal precedes networking. A disconnected hub cannot undo this choice.
      await this.save(local)
      await this.native.detach()
      if (local.incoming) await this.call('cancel', { id: local.incoming.request.value.id })
    } finally {
      this.busy = false
    }
  }
  async approve(channel: ConfigChannel, code: string) {
    this.guard()
    if (this.busy) throw new Error('请等待当前交接完成。')
    this.busy = true
    try {
      const request = await this.check(channel.request)
      if (
        request.expires < Date.now() ||
        request.target === this.config.device ||
        code !== (await requestCode(request))
      )
        throw new Error('请求过期或校验码不符。')
      const available = await this.native.available()
      if (request.scopes.some((scope) => !available[scope]))
        throw new Error('这台设备尚未配置所选兼容服务；请先配置，或让新设备缩小范围。')
      const local = await this.load()
      await this.native.authorize(request)
      this.guard()
      local.approvals[request.id] = { request: channel.request, sequence: 0 }
      await this.save(local)
    } finally {
      this.busy = false
    }
    await this.tick()
  }
  async reject(id: string) {
    if (this.busy) throw new Error('请等待当前交接完成。')
    await this.call('reject', { id })
  }
  async stopSending(id: string) {
    if (this.busy) throw new Error('请等待当前交接完成。')
    this.busy = true
    try {
      const local = await this.load()
      const approved = local.approvals[id]
      if (approved) await this.native.revoke(approved.request.value)
      delete local.approvals[id]
      await this.save(local)
      await this.call('cancel', { id })
    } finally {
      this.busy = false
    }
  }
  async sending() {
    return Object.values((await this.load()).approvals).filter((item) => !item.onceDone)
  }
  private async check(signed: Signed<ConfigRequest>) {
    const request = await verifyConfig('request', signed, this.config.key)
    validateRequest(request)
    if (request.space !== this.config.space) throw new Error('配置交接空间不符。')
    return request
  }
  async tick(): Promise<ConfigChannel[]> {
    if (this.busy) return this.pending
    this.guard()
    this.busy = true
    try {
      const local = await this.load()
      if (local.incoming && !local.incoming.stopped) {
        const nativeState = await this.native.state()
        let changed =
          nativeState.request === local.incoming.request.value.id && nativeState.detached
        if (
          !changed &&
          local.incoming.applied &&
          !(
            nativeState.request === local.incoming.request.value.id &&
            (nativeState.sequence ?? 0) > local.incoming.sequence
          )
        ) {
          const current = await this.native.available()
          changed = local.incoming.request.value.scopes.some(
            (scope) => publicScope(current, scope) !== publicScope(local.incoming!.applied!, scope),
          )
        }
        if (changed) {
          local.incoming.stopped = true
          await this.save(local)
          await this.native.detach()
        }
      }
      if (local.incoming?.stopped)
        await this.call('cancel', { id: local.incoming.request.value.id })
      if (
        local.incoming &&
        !local.incoming.stopped &&
        local.incoming.request.value.expires > Date.now() &&
        !local.incoming.sequence &&
        !local.incoming.submitted
      ) {
        await this.call('request', { request: local.incoming.request })
        local.incoming.submitted = true
        await this.save(local)
      }
      const response = (await this.call('poll')) as { channels: ConfigChannel[] }
      if (!Array.isArray(response.channels) || response.channels.length > 32)
        throw new Error('配置列表无效。')
      const live = new Set(response.channels.map((channel) => channel.request?.value?.id))
      for (const id of Object.keys(local.approvals))
        if (!live.has(id)) {
          await this.native.revoke(local.approvals[id].request.value)
          delete local.approvals[id]
        }
      if (
        local.incoming?.submitted &&
        !local.incoming.stopped &&
        !live.has(local.incoming.request.value.id)
      ) {
        local.incoming.stopped = true
        await this.native.detach()
      }
      await this.save(local)
      const pending: ConfigChannel[] = []
      for (const channel of response.channels) {
        const request = await this.check(channel.request)
        const incoming = local.incoming
        if (
          incoming &&
          !incoming.stopped &&
          request.target === this.config.device &&
          request.id === incoming.request.value.id
        ) {
          if (JSON.stringify(channel.request) !== JSON.stringify(incoming.request))
            throw new Error('交接请求被替换。')
          if (!channel.packet) continue
          const packet = await verifyConfig(`packet:${request.id}`, channel.packet, this.config.key)
          validatePacket(packet)
          if (
            packet.source !== channel.source ||
            (incoming.source && incoming.source !== packet.source)
          )
            throw new Error('配置来源变化，未继续接收。')
          if (packet.sequence < incoming.sequence) throw new Error('旧配置包被拒绝。')
          if (packet.sequence > incoming.sequence || !incoming.sequence) {
            this.guard()
            const safe = await this.native.apply(
              configContext(request, packet.source, packet.sequence),
              packet,
            )
            this.guard()
            await this.native.applyPublic(safe)
            incoming.source = packet.source
            incoming.sequence = packet.sequence
            incoming.applied = safe
            await this.save(local)
          }
          await this.call('ack', { id: request.id, sequence: packet.sequence })
          if (!request.follow) {
            incoming.stopped = true
            await this.save(local)
          }
        } else {
          const approval = local.approvals[request.id]
          if (
            approval &&
            !approval.onceDone &&
            JSON.stringify(approval.request) === JSON.stringify(channel.request) &&
            (!channel.source || channel.source === this.config.device)
          ) {
            // Do not replace unacknowledged ciphertext. Native import is replay-safe if ack is lost.
            if (channel.packet && channel.acknowledged < channel.packet.value.sequence) continue
            if (!request.follow && channel.acknowledged > 0) {
              await this.native.revoke(request)
              approval.onceDone = true
              await this.save(local)
              continue
            }
            const available = await this.native.available()
            if (
              request.follow &&
              approval.revision &&
              approval.revision === available.revision &&
              channel.acknowledged > 0
            )
              continue
            const selected: PublicConfig = {}
            for (const scope of request.scopes) {
              if (!available[scope]) throw new Error('共享服务已在本机停用；未发送空值覆盖目标。')
              Object.assign(selected, { [scope]: available[scope] })
            }
            // Sequence is persisted first; crashes can skip a number but never reuse one with new content.
            approval.sequence = Math.max(approval.sequence, channel.acknowledged) + 1
            await this.save(local)
            this.guard()
            const sealed = await this.native.seal(
              request.publicKey,
              configContext(request, this.config.device, approval.sequence),
              selected,
            )
            const packet: ConfigPacket = {
              source: this.config.device,
              sequence: approval.sequence,
              ...sealed,
            }
            validatePacket(packet)
            await this.call('deliver', {
              id: request.id,
              packet: await signConfig(`packet:${request.id}`, packet, this.config.key),
            })
            approval.revision = available.revision
            await this.save(local)
          } else if (
            !channel.source &&
            request.target !== this.config.device &&
            request.expires > Date.now()
          )
            pending.push(channel)
        }
      }
      this.pending = pending
      return pending
    } finally {
      this.busy = false
    }
  }
}
