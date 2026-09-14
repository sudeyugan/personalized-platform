import { describe, expect, it } from 'vitest'
import type { CompanionCharacterPackage } from '../../../domain/models'
import { CharacterController } from './CharacterController'
import { characterPackagePaths, planCharacterPackage, resolveCharacterPackage } from './CharacterLoader'

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
