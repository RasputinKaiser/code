import { describe, expect, it } from 'bun:test'
import branch from './index.js'

describe('/branch command', () => {
  it('exposes /fork as a public alias', () => {
    expect(branch).toMatchObject({
      type: 'local-jsx',
      name: 'branch',
      aliases: ['fork'],
      description: 'Create a branch of the current conversation at this point',
      argumentHint: '[name]',
    })
  })
})
