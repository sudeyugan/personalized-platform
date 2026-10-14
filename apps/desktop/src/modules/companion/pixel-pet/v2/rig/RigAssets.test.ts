import { afterEach, expect, it, vi } from 'vitest'
import { loadRigAssets } from './RigAssets'

const fixture = vi.hoisted(() => ({ neutral: {}, draw: vi.fn() }))
vi.mock('../../art/prepareArt', () => ({ loadPreparedArt: vi.fn(async () => fixture.neutral) }))
vi.mock('../../art/eyeRaster', () => ({ prepareEye: vi.fn(() => ({})) }))
vi.mock('../../art/deformation', () => ({ prepareArtRows: vi.fn(() => []) }))

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('keeps the approved neutral and never samples the contaminated duplicate sixth atlas cell', async () => {
  vi.stubGlobal('Image', class {
    naturalWidth = 836
    naturalHeight = 1881
    async decode() {}
  })
  const context = { drawImage: fixture.draw, getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(0) })) }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
  const textures = await loadRigAssets('right-edge')
  expect([...textures.keys()]).toEqual(['wave', 'touch-hair', 'chin', 'stretch', 'sleep', 'neutral'])
  expect(textures.get('neutral')).toBe(fixture.neutral)
  expect(fixture.draw).toHaveBeenCalledTimes(5)
  expect(fixture.draw.mock.calls.some(args => args[1] === 418 && args[2] === 1254)).toBe(false)
})
