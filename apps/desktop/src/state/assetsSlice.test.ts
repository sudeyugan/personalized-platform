import { describe, expect, it } from 'vitest'
import { createSeedLibrary } from '../domain/seed'
import { assetIdsInContent, orphanAssets, referencedAssetIds } from './assetsSlice'

describe('asset references', () => {
  it('finds nested editor references and excludes used assets from orphan cleanup', () => {
    const data = createSeedLibrary()
    const chapter = Object.values(data.chapters)[0]
    chapter.content = { type: 'doc', content: [{ type: 'blockquote', content: [{ type: 'imageAsset', attrs: { assetId: 'asset-used' } }] }] }
    data.assets = [
      { id: 'asset-used', fileName: 'used.png', mimeType: 'image/png', size: 1, width: 1, height: 1, sha256: 'a', createdAt: '2026-08-09', chapterIds: [] },
      { id: 'asset-orphan', fileName: 'orphan.png', mimeType: 'image/png', size: 1, width: 1, height: 1, sha256: 'b', createdAt: '2026-08-09', chapterIds: [] },
    ]

    expect(assetIdsInContent(chapter.content)).toEqual(['asset-used'])
    expect([...referencedAssetIds(data)]).toContain('asset-used')
    expect(orphanAssets(data).map((asset) => asset.id)).toEqual(['asset-orphan'])
  })
})
