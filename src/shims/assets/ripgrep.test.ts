import { describe, expect, it } from 'bun:test'

import { getBundledRipgrepAsset } from './ripgrep.js'

describe('bundled ripgrep asset selection', () => {
  it('returns the packaged ripgrep asset for the current supported platform', () => {
    const asset = getBundledRipgrepAsset()
    expect(asset).not.toBeNull()
    expect(asset!.relativePath).toContain(`vendor/ripgrep/${process.arch}-${process.platform}`)
    expect(asset!.embeddedPath.length).toBeGreaterThan(0)
  })
})
