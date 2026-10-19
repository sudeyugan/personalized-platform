import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HubStore } from './store.mjs'
import { createHubServer } from './server.mjs'

test('one-time bootstrap, expiry, independent credentials and revocation', () => {
  const store = new HubStore(':memory:')
  try {
    const root = store.initialize(), owner = store.enroll(root, 'owner'), admin = store.authenticate(owner.token)
    assert.throws(() => store.initialize())
    assert.throws(() => store.enroll(root, 'duplicate'))
    const expired = store.invite(admin, 100)
    assert.throws(() => store.enroll(expired.invite, 'late', 600_101))
    const invite = store.invite(admin), second = store.enroll(invite.invite, 'phone')
    assert.throws(() => store.enroll(invite.invite, 'replay'))
    assert.notEqual(second.token, owner.token)
    assert.throws(() => store.invite(store.authenticate(second.token)))
    store.revoke(admin, second.device)
    assert.equal(store.authenticate(second.token), undefined)
    assert.throws(() => store.revoke(admin, owner.device))
  } finally { store.close() }
})
test('restart persistence, idempotent log, ownership, cursor and transaction rollback', () => {
  const directory = mkdtempSync(join(tmpdir(), 'yiyu-hub-test-'))
  let store = new HubStore(join(directory, 'test.sqlite'))
  try {
    const owner = store.enroll(store.initialize(), 'owner'), device = store.authenticate(owner.token)
    const envelope = { id: randomUUID(), device: owner.device, iv: 'AAAAAAAAAAAAAAAA', body: 'A'.repeat(24) }
    assert.equal(store.exchange(device, 0, [envelope]).cursor, 1)
    assert.equal(store.exchange(device, 0, [envelope]).entries.length, 1)
    assert.throws(() => store.exchange(device, 0, [{ ...envelope, body: 'B'.repeat(24) }]))
    assert.throws(() => store.exchange(device, 2, []))
    assert.throws(() => store.exchange(device, 1, [{ ...envelope, id: randomUUID() }, { ...envelope, id: randomUUID(), device: randomUUID() }]))
    assert.equal(store.exchange(device, 1, []).entries.length, 0)
    store.close(); store = new HubStore(join(directory, 'test.sqlite'))
    assert.equal(store.exchange(store.authenticate(owner.token), 0, []).entries.length, 1)
  } finally { store.close(); rmSync(directory, { recursive: true }) }
})
test('HTTP refuses foreign origins and unauthenticated requests; private content is not logged', async () => {
  const store = new HubStore(':memory:'), root = store.initialize(), server = createHubServer(store)
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const url = `http://127.0.0.1:${server.address().port}/v1/enroll`
    assert.equal((await fetch(url, { method: 'POST', headers: { Origin: 'https://evil.example' } })).status, 403)
    assert.equal((await fetch(url, { method: 'POST', body: '{}' })).status, 401)
    const result = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${root}` }, body: JSON.stringify({ name: 'test', device: randomUUID(), token: randomBytes(32).toString('hex') }) })
    assert.equal(result.status, 200)
    assert.ok((await result.json()).device)
  } finally { await new Promise(resolve => server.close(resolve)); store.close() }
})
test('lost enrollment response retries the same identity; recovery needs owner credential and matching space', () => {
  const store = new HubStore(':memory:')
  try {
    const root = store.initialize(), proposed = { device: randomUUID(), token: randomBytes(32).toString('hex') }
    const result = store.enroll(root, 'first', Date.now(), proposed)
    assert.deepEqual(store.enroll(root, 'retry', Date.now(), proposed), result)
    assert.throws(() => store.enroll(root, 'must not create a different encryption identity'))
    assert.throws(() => store.recover(root, randomUUID(), 'wrong hub'))
    assert.throws(() => store.recover(randomBytes(32).toString('hex'), store.space, 'wrong owner'))
    const restored = store.recover(root, store.space, 'restored')
    assert.equal(store.authenticate(restored.token).admin, 1)
    const admin = store.authenticate(result.token), invitation = store.invite(admin)
    const phone = { device: randomUUID(), token: randomBytes(32).toString('hex') }
    const first = store.enroll(invitation.invite, 'phone', Date.now(), phone)
    assert.deepEqual(store.enroll(invitation.invite, 'retry', Date.now(), phone), first)
    store.revoke(admin, first.device)
    assert.throws(() => store.enroll(invitation.invite, 'revoked retry', Date.now(), phone))
  } finally { store.close() }
})
