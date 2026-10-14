import { afterEach, expect, it, vi } from 'vitest'
import { loadRigAssets } from './RigAssets'
import { ART_PROFILES, artEyeCenter, type ArtProfile } from '../../art/artProfiles'

const fixture = vi.hoisted(() => ({ neutral: {profile: undefined as unknown as ArtProfile, resolution:3, source:undefined as unknown as HTMLCanvasElement}, draw: vi.fn() }))
vi.mock('../../art/prepareArt', () => ({ loadPreparedArt: vi.fn(async () => fixture.neutral) }))
vi.mock('../../art/eyeRaster', () => ({ prepareEye: vi.fn(() => ({})) }))
vi.mock('../../art/deformation', () => ({ prepareArtRows: vi.fn(() => []) }))

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('keeps approved neutral and fits five independent complete poses to its head size and center', async () => {
  fixture.neutral.profile=ART_PROFILES.pixel
  fixture.neutral.source=document.createElement('canvas');fixture.neutral.source.width=576;fixture.neutral.source.height=720
  vi.stubGlobal('Image', class {
    naturalWidth = 1024
    naturalHeight = 1536
    async decode() {}
  })
  const context = { drawImage: fixture.draw, getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(0) })) }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
  const textures = await loadRigAssets('right-edge')
  expect([...textures.keys()]).toEqual(['wave', 'touch-hair', 'chin', 'stretch', 'sleep', 'neutral'])
  expect(textures.get('neutral')!.source).toBe(fixture.neutral.source)
  expect(textures.get('neutral')).not.toBe(fixture.neutral)
  expect(fixture.draw.mock.calls.length).toBeGreaterThan(5)
  expect(fixture.draw.mock.calls.every(args => args.length===9)).toBe(true)
  for(const art of textures.values()){
    expect(artEyeCenter(art.profile).x).toBeCloseTo(artEyeCenter(ART_PROFILES.pixel).x,10)
    expect(artEyeCenter(art.profile).y).toBeCloseTo(artEyeCenter(ART_PROFILES.pixel).y,10)
  }
  expect(textures.get('wave')!.gesture).toBeDefined()
  expect(textures.get('neutral')!.gesture).toBeUndefined()
})
