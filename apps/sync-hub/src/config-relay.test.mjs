import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { HubStore } from './store.mjs'
import { ConfigRelay } from './config-relay.mjs'
const signed = (value) => ({ value, mac: 'A'.repeat(43) + '=' })
function setup() {
  const store = new HubStore(':memory:'),
    owner = store.enroll(store.initialize(), 'owner'),
    source = store.authenticate(owner.token)
  const enroll = (name) => {
    const result = store.enroll(store.invite(source).invite, name)
    return store.authenticate(result.token)
  }
  const target = enroll('phone'),
    other = enroll('other'),
    relay = new ConfigRelay(store)
  const request = signed({
    v: 1,
    id: randomUUID(),
    space: store.space,
    target: target.id,
    name: '虚构手机',
    publicKey: 'A'.repeat(124),
    scopes: ['model'],
    follow: true,
    expires: Date.now() + 600000,
  })
  const packet = signed({
    source: source.id,
    sequence: 1,
    ephemeral: 'A'.repeat(124),
    iv: 'A'.repeat(16),
    body: 'A'.repeat(48),
  })
  return { store, source, target, other, relay, request, packet }
}
test('separate mailbox ownership, retries, sequence, cancellation and no ordinary log pollution', () => {
  const { store, source, target, other, relay, request, packet } = setup()
  try {
    assert.throws(() => relay.run(source, { operation: 'request', request }))
    relay.run(target, { operation: 'request', request })
    relay.run(target, { operation: 'request', request })
    assert.equal(relay.run(source, { operation: 'poll' }).channels.length, 1)
    assert.throws(() => relay.run(target, { operation: 'deliver', id: request.value.id, packet }))
    relay.run(source, { operation: 'deliver', id: request.value.id, packet })
    relay.run(source, { operation: 'deliver', id: request.value.id, packet })
    assert.equal(relay.run(other, { operation: 'poll' }).channels.length, 0)
    assert.throws(() => relay.run(other, { operation: 'cancel', id: request.value.id }))
    assert.throws(() =>
      relay.run(other, {
        operation: 'deliver',
        id: request.value.id,
        packet: signed({ ...packet.value, source: other.id, sequence: 2 }),
      }),
    )
    assert.throws(() => relay.run(source, { operation: 'ack', id: request.value.id, sequence: 1 }))
    assert.throws(() =>
      relay.run(source, {
        operation: 'deliver',
        id: request.value.id,
        packet: signed({ ...packet.value, sequence: 2 }),
      }),
    )
    relay.run(target, { operation: 'ack', id: request.value.id, sequence: 1 })
    relay.run(target, { operation: 'ack', id: request.value.id, sequence: 1 })
    assert.equal(relay.run(source, { operation: 'poll' }).channels[0].packet, null)
    assert.throws(() => relay.run(source, { operation: 'deliver', id: request.value.id, packet }))
    relay.run(source, {
      operation: 'deliver',
      id: request.value.id,
      packet: signed({ ...packet.value, sequence: 2 }),
    })
    assert.equal(store.exchange(source, 0, []).entries.length, 0)
    relay.run(target, { operation: 'cancel', id: request.value.id })
    relay.run(target, { operation: 'cancel', id: request.value.id })
    assert.equal(relay.run(source, { operation: 'poll' }).channels.length, 0)
    assert.throws(() => relay.run(target, { operation: 'request', request }))
  } finally {
    store.close()
  }
})
test('expiry, quotas, revocation and one-time deliveries fail closed', () => {
  const { store, source, target, relay, request, packet } = setup()
  try {
    assert.throws(() =>
      relay.run(target, {
        operation: 'request',
        request: signed({ ...request.value, expires: 1 }),
      }),
    )
    assert.throws(() =>
      relay.run(target, {
        operation: 'request',
        request: signed({ ...request.value, scopes: ['passwords'] }),
      }),
    )
    const once = signed({ ...request.value, follow: false })
    relay.run(target, { operation: 'request', request: once })
    assert.throws(() =>
      relay.run(target, {
        operation: 'request',
        request: signed({ ...once.value, id: randomUUID() }),
      }),
    )
    relay.run(source, { operation: 'deliver', id: request.value.id, packet })
    relay.run(target, { operation: 'ack', id: request.value.id, sequence: 1 })
    assert.throws(() =>
      relay.run(source, {
        operation: 'deliver',
        id: request.value.id,
        packet: signed({ ...packet.value, sequence: 2 }),
      }),
    )
    store.revoke(source, target.id)
    assert.equal(relay.run(source, { operation: 'poll' }).channels.length, 0)
  } finally {
    store.close()
  }
})
