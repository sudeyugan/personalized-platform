import { describe, expect, it } from 'vitest'
import { validPetMenuAction } from './menuActions'
describe('bounded desktop menu commands', () => {
  it.each([{ kind: 'hide' }, { kind: 'settings' }, { kind: 'style', value: 'chibi' }, { kind: 'side', value: 'bottom-edge' }])('allows known commands %j', value => expect(validPetMenuAction(value)).toBe(true))
  it.each([null, {}, { kind: 'execute', value: 'shell' }, { kind: 'style', value: ['pixel'] }, { kind: 'side', value: 'sleep' }, { kind: 'style', value: 1 }])('rejects unknown or incorrectly typed commands %j', value => expect(validPetMenuAction(value)).toBe(false))
})
