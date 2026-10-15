// @vitest-environment node
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { expect,it } from 'vitest'
import { TRUSTED_HELPER_ID } from '../browser-extension/trusted-helper-id.js'
it('separates required debugger from the reader and pins the public helper identity',()=>{
  const reader=JSON.parse(readFileSync(new URL('../browser-extension/manifest.json',import.meta.url),'utf8'))
  const helper=JSON.parse(readFileSync(new URL('./manifest.json',import.meta.url),'utf8'))
  expect([...(reader.permissions??[]),...(reader.optional_permissions??[])]).not.toContain('debugger')
  expect(helper.permissions).toEqual(['storage','debugger']);expect(helper.host_permissions).toBeUndefined();expect(helper.optional_host_permissions).toBeUndefined()
  const id=[...createHash('sha256').update(Buffer.from(helper.key,'base64')).digest('hex').slice(0,32)].map(c=>String.fromCharCode(97+parseInt(c,16))).join('')
  expect(id).toBe(TRUSTED_HELPER_ID);expect(reader.externally_connectable.ids).toEqual([id])
  expect(helper.externally_connectable.matches).toBeUndefined();expect(reader.externally_connectable.matches).toBeUndefined()
})
