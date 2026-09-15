import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CompanionCharacterPackage } from '../../../domain/models'
import { CharacterController } from './CharacterController'
import { characterPackagePaths, planCharacterPackage, resolveCharacterPackage, validateCharacterCanvas } from './CharacterLoader'

function packageFile(path: string, content = 'png') {
  const file = new File([content], path.split('/').at(-1)!, { type: path.endsWith('.json') ? 'application/json' : 'image/png' })
  Object.defineProperty(file, 'webkitRelativePath', { value: `character_001/${path}` })
  return file
}

const source = {
  id: 'character_001', name: '测试伙伴', canvas: { width: 1024, height: 1536 }, base: { body: 'base/body.png' },
  eyes: { neutral: { open: 'eyes/open.png', half: 'eyes/half.png', closed: 'eyes/closed.png' } },
  brows: { neutral: 'brows/neutral.png' }, mouth: { closed: 'mouth/closed.png', half: 'mouth/half.png', open: 'mouth/open.png' }, overlays: {},
  expressions: { neutral: { eye: 'neutral', brow: 'neutral', mouth: 'closed' }, happy: { eye: 'neutral', brow: 'neutral', mouth: 'closed' }, angry: { eye: 'neutral', brow: 'neutral', mouth: 'closed' }, sad: { eye: 'neutral', brow: 'neutral', mouth: 'closed' } },
  motions: { wave: { directory: 'motions/wave', fps: 10, loop: false } },
}

function files() {
  return [packageFile('character.json', JSON.stringify(source)), ...['base/body.png', 'eyes/open.png', 'eyes/half.png', 'eyes/closed.png', 'brows/neutral.png', 'mouth/closed.png', 'mouth/half.png', 'mouth/open.png', 'motions/wave/10.png', 'motions/wave/2.png', 'motions/wave/1.png'].map((path) => packageFile(path))]
}

function slottedFiles() {
  const slotted = {
    ...source,
    slots: { eyes: { x: 365, y: 300, width: 300, height: 130 } },
    eyes: { neutral: {
      open: { src: 'eyes/open.png', slot: 'eyes' },
      half: { src: 'eyes/half.png', slot: 'eyes' },
      closed: { src: 'eyes/closed.png', slot: 'eyes', offset: { y: -2 } },
    } },
  }
  return files().map((file) => file.name === 'character.json' ? packageFile('character.json', JSON.stringify(slotted)) : file)
}

afterEach(() => vi.unstubAllGlobals())

describe('character package loader', () => {
  it('validates paths and sorts numbered motion frames naturally', async () => {
    const plan = await planCharacterPackage(files())
    expect(plan.motionPaths.wave).toEqual(['motions/wave/1.png', 'motions/wave/2.png', 'motions/wave/10.png'])
    const ids = new Map(characterPackagePaths(plan).map((path) => [path, `asset-${path.replaceAll(/[^a-z0-9]/gi, '-')}`]))
    const resolved = resolveCharacterPackage(plan, ids)
    expect(resolved.motions.wave.frameAssetIds).toEqual([ids.get('motions/wave/1.png'), ids.get('motions/wave/2.png'), ids.get('motions/wave/10.png')])
  })

  it('rejects incomplete packages before importing assets', async () => {
    await expect(planCharacterPackage(files().filter((file) => file.name !== 'closed.png'))).rejects.toThrow(/缺少图片/)
  })

  it('resolves local sprite metadata while keeping legacy string resources', async () => {
    const plan = await planCharacterPackage(slottedFiles())
    const ids = new Map(characterPackagePaths(plan).map((path) => [path, `asset-${path}`]))
    const resolved = resolveCharacterPackage(plan, ids)
    expect(resolved.version).toBe(2)
    expect(resolved.eyes.neutral.open).toEqual({ assetId: 'asset-eyes/open.png', slot: 'eyes', offset: undefined })
    expect(resolved.brows.neutral).toBe('asset-brows/neutral.png')
    expect(resolved.slots?.eyes).toEqual({ x: 365, y: 300, width: 300, height: 130 })
  })

  it('accepts slot-local images but still requires legacy sprites and motions to use the full canvas', async () => {
    const bitmap = vi.fn(async (file: File) => {
      const path = (file as File & { webkitRelativePath: string }).webkitRelativePath
      return { width: path.includes('/eyes/') ? 300 : 1024, height: path.includes('/eyes/') ? 130 : 1536, close: vi.fn() }
    })
    vi.stubGlobal('createImageBitmap', bitmap)
    await expect(validateCharacterCanvas(await planCharacterPackage(slottedFiles()))).resolves.toEqual([])
    await expect(validateCharacterCanvas(await planCharacterPackage(files()))).rejects.toThrow(/局部图片需要声明 slot/)
  })
})

describe('character controller priority', () => {
  it('keeps talking and blinking from overriding a fixed motion', async () => {
    const character = resolveCharacterPackage(await planCharacterPackage(files()), new Map(characterPackagePaths(await planCharacterPackage(files())).map((path) => [path, `asset-${path.replaceAll(/[^a-z0-9]/gi, '-')}`]))) as CompanionCharacterPackage
    const controller = new CharacterController(character)
    const playing = controller.playMotion('wave')
    controller.startTalking()
    expect(controller.snapshot().mode).toBe('motion')
    controller.stopMotion()
    await playing
    expect(controller.snapshot().mode).toBe('idle')
    controller.dispose()
  })
})
