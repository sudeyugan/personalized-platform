import { describe, expect, it } from 'vitest'
import { contentBackgroundCss } from './backgrounds'

describe('contentBackgroundCss', () => {
  it('uses the active theme background and safely quotes the uploaded image', () => {
    const value = contentBackgroundCss('data:image/png;base64,abc123')

    expect(value).toContain('var(--bg)')
    expect(value).not.toContain('var(--app-bg)')
    expect(value).toContain('url("data:image/png;base64,abc123")')
  })
})