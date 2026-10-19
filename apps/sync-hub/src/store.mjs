import { DatabaseSync } from 'node:sqlite'
import { createHash, randomBytes, randomUUID } from 'node:crypto'

const hash = value => createHash('sha256').update(value).digest('hex')
const token = () => randomBytes(32).toString('hex')
export class HubStore {
  constructor(path) {
    this.db = new DatabaseSync(path)
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS devices(id TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL, admin INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS invites(hash TEXT PRIMARY KEY, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS operations(seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, device TEXT NOT NULL, payload TEXT NOT NULL);`)
    if (!this.get('space')) this.set('space', randomUUID())
    this.space = this.get('space')
  }
  get(key) { return this.db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value }
  set(key, value) { this.db.prepare('INSERT OR REPLACE INTO meta VALUES(?,?)').run(key, value) }
  initialize() {
    if (this.get('owner')) throw new Error('中枢已经初始化，不会覆盖原凭证。')
    const credential = token()
    this.set('owner', hash(credential))
    return credential
  }
  authenticate(credential) {
    return this.db.prepare('SELECT id,name,admin FROM devices WHERE token_hash=? AND revoked=0').get(hash(credential))
  }
  enroll(credential, name, now = Date.now(), proposed) {
    const retry = proposed && this.authenticate(proposed.token)
    if (proposed && retry?.id === proposed.device) return { space: this.space, device: retry.id, token: proposed.token }
    const digest = hash(credential)
    const admin = this.get('owner') === digest && !this.get('bootstrapped')
    const invitation = this.db.prepare('SELECT expires FROM invites WHERE hash=?').get(digest)
    if (!admin && (!invitation || invitation.expires < now)) throw Object.assign(new Error('邀请过期或已用'), { status: 401 })
    const id = proposed?.device ?? randomUUID(), secret = proposed?.token ?? token()
    this.db.exec('BEGIN IMMEDIATE')
    try {
      if (admin) this.set('bootstrapped', 'yes')
      else this.db.prepare('DELETE FROM invites WHERE hash=?').run(digest)
      this.db.prepare('INSERT INTO devices(id,name,token_hash,admin) VALUES(?,?,?,?)').run(id, name, hash(secret), admin ? 1 : 0)
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
    return { space: this.space, device: id, token: secret }
  }
  recover(credential, space, name, proposed) {
    if (this.get('owner') !== hash(credential) || space !== this.space) throw Object.assign(new Error('恢复凭证或中枢身份无效'), { status: 401 })
    const retry = proposed && this.authenticate(proposed.token)
    if (proposed && retry?.id === proposed.device) return { space: this.space, device: retry.id, token: proposed.token }
    const id = proposed?.device ?? randomUUID(), secret = proposed?.token ?? token()
    this.db.prepare('INSERT INTO devices(id,name,token_hash,admin) VALUES(?,?,?,1)').run(id, String(name ?? '恢复的设备').slice(0, 60), hash(secret))
    return { space: this.space, device: id, token: secret }
  }
  invite(device, now = Date.now()) {
    if (!device.admin) throw Object.assign(new Error('只有首台管理设备能邀请'), { status: 403 })
    this.db.prepare('DELETE FROM invites WHERE expires<?').run(now)
    if (this.db.prepare('SELECT count(*) AS n FROM invites').get().n >= 10) throw Object.assign(new Error('邀请数量上限'), { status: 429 })
    const invitation = token()
    this.db.prepare('INSERT INTO invites VALUES(?,?)').run(hash(invitation), now + 600_000)
    return { invite: invitation, expiresAt: now + 600_000 }
  }
  devices(device) {
    if (!device.admin) throw Object.assign(new Error('仅管理设备可查看'), { status: 403 })
    return this.db.prepare('SELECT id,name,revoked FROM devices').all()
  }
  revoke(device, id) {
    if (!device.admin || id === device.id) throw Object.assign(new Error('不能执行此撤销'), { status: 403 })
    this.db.prepare('UPDATE devices SET revoked=1 WHERE id=?').run(id)
    // Outstanding invitations may have leaked alongside the device.
    this.db.prepare('DELETE FROM invites').run()
  }
  exchange(device, after, envelopes) {
    const latest = this.db.prepare('SELECT coalesce(max(seq),0) AS seq FROM operations').get().seq
    if (!Number.isSafeInteger(after) || after < 0 || after > latest) throw Object.assign(new Error('同步游标异常；请检查中枢备份，不会自动回退'), { status: 409 })
    if (!Array.isArray(envelopes) || envelopes.length > 4) throw Object.assign(new Error('批次上限'), { status: 400 })
    if (this.db.prepare('SELECT count(*) AS n FROM operations').get().n + envelopes.length > 100_000
      || Number(this.db.prepare('PRAGMA page_count').get().page_count) * 4096 > 256_000_000) throw Object.assign(new Error('中枢已达安全容量上限，请备份维护'), { status: 507 })
    this.db.exec('BEGIN IMMEDIATE')
    try {
      for (const envelope of envelopes) {
        if (envelope?.device !== device.id || !/^[a-f0-9-]{36}$/.test(envelope.id) || !/^[A-Za-z0-9+/]{16}$/.test(envelope.iv)
          || typeof envelope.body !== 'string' || envelope.body.length < 24 || envelope.body.length > 700_000 || !/^[A-Za-z0-9+/]+=*$/.test(envelope.body)
          || Object.keys(envelope).sort().join(',') !== 'body,device,id,iv') throw Object.assign(new Error('密文格式无效'), { status: 400 })
        const payload = JSON.stringify(envelope)
        const existing = this.db.prepare('SELECT payload FROM operations WHERE id=?').get(envelope.id)
        if (existing && existing.payload !== payload) throw Object.assign(new Error('操作标识冲突'), { status: 409 })
        if (!existing) this.db.prepare('INSERT INTO operations(id,device,payload) VALUES(?,?,?)').run(envelope.id, device.id, payload)
      }
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
    const rows = this.db.prepare('SELECT seq,payload FROM operations WHERE seq>? ORDER BY seq LIMIT 5').all(after)
    const entries = rows.slice(0, 4).map(row => ({ seq: row.seq, envelope: JSON.parse(row.payload) }))
    return { space: this.space, entries, cursor: entries.at(-1)?.seq ?? after, more: rows.length > 4 }
  }
  close() { this.db.close() }
}
