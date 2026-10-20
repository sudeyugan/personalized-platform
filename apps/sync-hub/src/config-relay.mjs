// Separate, bounded ciphertext mailbox. No provider requests or plaintext configuration.
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status })
}
const uuid = (value) => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value)
const signed = (value) =>
  value &&
  Object.keys(value).sort().join(',') === 'mac,value' &&
  typeof value.mac === 'string' &&
  /^[A-Za-z0-9+/]{43}=$/.test(value.mac)
export class ConfigRelay {
  constructor(store) {
    this.store = store
    this.db = store.db
    this.db.exec(`CREATE TABLE IF NOT EXISTS config_channels(
      id TEXT PRIMARY KEY, target TEXT NOT NULL, source TEXT, request TEXT NOT NULL,
      packet TEXT, sequence INTEGER NOT NULL DEFAULT 0, acknowledged INTEGER NOT NULL DEFAULT 0,
      expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS config_closed(id TEXT PRIMARY KEY,target TEXT NOT NULL,expires INTEGER NOT NULL);`)
  }
  run(device, body, now = Date.now()) {
    if (!this.db.prepare('SELECT id FROM devices WHERE id=? AND revoked=0').get(device.id))
      fail('设备已撤销', 403)
    this.db
      .prepare(
        'DELETE FROM config_channels WHERE expires<? OR target IN (SELECT id FROM devices WHERE revoked=1) OR source IN (SELECT id FROM devices WHERE revoked=1)',
      )
      .run(now)
    this.db.prepare('DELETE FROM config_closed WHERE expires<?').run(now)
    const { operation } = body
    if (operation === 'poll') {
      this.db
        .prepare(
          'UPDATE config_channels SET expires=? WHERE source IS NOT NULL AND (source=? OR target=?)',
        )
        .run(now + 7 * 86400000, device.id, device.id)
      const channels = this.db
        .prepare(
          'SELECT * FROM config_channels WHERE target=? OR source=? OR source IS NULL ORDER BY expires LIMIT 32',
        )
        .all(device.id, device.id)
      return {
        channels: channels.map((row) => ({
          request: JSON.parse(row.request),
          source: row.source,
          packet: row.packet ? JSON.parse(row.packet) : null,
          acknowledged: row.acknowledged,
        })),
      }
    }
    if (operation === 'request') {
      const signedRequest = body.request,
        request = signedRequest?.value
      if (
        !signed(signedRequest) ||
        request?.v !== 1 ||
        Object.keys(request).sort().join(',') !==
          'expires,follow,id,name,publicKey,scopes,space,target,v' ||
        !uuid(request.id) ||
        request.space !== this.store.space ||
        request.target !== device.id ||
        typeof request.name !== 'string' ||
        request.name.length > 60 ||
        typeof request.publicKey !== 'string' ||
        !/^[A-Za-z0-9+/]{120,160}={0,2}$/.test(request.publicKey) ||
        typeof request.follow !== 'boolean' ||
        !Array.isArray(request.scopes) ||
        request.scopes.length < 1 ||
        request.scopes.length > 2 ||
        request.scopes.some((item) => !['model', 'voice'].includes(item)) ||
        new Set(request.scopes).size !== request.scopes.length ||
        !Number.isSafeInteger(request.expires) ||
        request.expires < now ||
        request.expires > now + 610000
      )
        fail('配置请求无效或过期')
      const serialized = JSON.stringify(signedRequest)
      if (serialized.length > 3000) fail('配置请求大小无效')
      if (this.db.prepare('SELECT id FROM config_closed WHERE id=?').get(request.id))
        fail('配置请求已停止；请重新申请', 409)
      if (this.db.prepare('SELECT count(*) AS n FROM config_closed').get().n >= 1024)
        fail('交接操作过于频繁，请稍后重试', 429)
      const existing = this.db
        .prepare('SELECT request FROM config_channels WHERE id=?')
        .get(request.id)
      if (existing) {
        if (existing.request !== serialized) fail('配置请求标识冲突', 409)
        return { success: true }
      }
      if (
        this.db.prepare('SELECT count(*) AS n FROM config_channels').get().n >= 32 ||
        this.db.prepare('SELECT count(*) AS n FROM config_channels WHERE target=?').get(device.id)
          .n >= 1
      )
        fail('已有交接或数量上限；请先停止旧交接', 409)
      this.db
        .prepare('INSERT INTO config_channels(id,target,request,expires) VALUES(?,?,?,?)')
        .run(request.id, device.id, serialized, request.expires)
      return { success: true }
    }
    if (!uuid(body.id)) fail('交接标识无效')
    const row = this.db.prepare('SELECT * FROM config_channels WHERE id=?').get(body.id)
    // Local stop/reject is idempotent, including already-expired or revoked channels.
    if (!row) {
      if (operation === 'cancel' || operation === 'reject') return { success: true }
      fail('配置交接不存在或已过期', 404)
    }
    if (operation === 'deliver') {
      const packet = body.packet?.value
      if (row.target === device.id || (row.source && row.source !== device.id))
        fail('非交接来源', 403)
      if (
        !signed(body.packet) ||
        packet?.source !== device.id ||
        Object.keys(packet).sort().join(',') !== 'body,ephemeral,iv,sequence,source' ||
        !Number.isSafeInteger(packet.sequence) ||
        packet.sequence < 1 ||
        typeof packet.body !== 'string' ||
        packet.body.length > 12000 ||
        packet.body.length < 24 ||
        !/^[A-Za-z0-9+/]+=*$/.test(packet.body) ||
        !/^[A-Za-z0-9+/]{120,160}={0,2}$/.test(packet.ephemeral) ||
        !/^[A-Za-z0-9+/]{16}$/.test(packet.iv) ||
        JSON.stringify(body.packet).length > 13000
      )
        fail('配置密文格式无效')
      const serialized = JSON.stringify(body.packet)
      if (packet.sequence === row.sequence && row.packet === serialized) return { success: true }
      if (packet.sequence <= row.sequence || row.sequence !== row.acknowledged)
        fail('序号旧或上一包未接收', 409)
      const request = JSON.parse(row.request).value
      if (row.sequence && !request.follow) fail('单次交接已经完成', 409)
      this.db
        .prepare('UPDATE config_channels SET source=?,packet=?,sequence=?,expires=? WHERE id=?')
        .run(device.id, serialized, packet.sequence, now + 7 * 86400000, body.id)
      return { success: true }
    }
    if (operation === 'ack') {
      if (row.target !== device.id) fail('仅目标可确认接收', 403)
      if (body.sequence !== row.sequence || row.sequence < 1) fail('确认序号不符', 409)
      this.db
        .prepare('UPDATE config_channels SET acknowledged=?,packet=NULL WHERE id=?')
        .run(row.sequence, body.id)
      return { success: true }
    }
    if (operation === 'cancel' || operation === 'reject') {
      if (
        row.target !== device.id &&
        row.source !== device.id &&
        !(operation === 'reject' && !row.source)
      )
        fail('不能停止其他设备的交接', 403)
      this.db
        .prepare('INSERT OR IGNORE INTO config_closed VALUES(?,?,?)')
        .run(body.id, row.target, now + 600000)
      this.db.prepare('DELETE FROM config_channels WHERE id=?').run(body.id)
      return { success: true }
    }
    fail('不支持的配置操作')
  }
}
