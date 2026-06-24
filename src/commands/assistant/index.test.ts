import { describe, expect, it } from 'bun:test'
import assistant from './index.js'

describe('/assistant command', () => {
  it('uses the local-jsx assistant session flow', () => {
    expect(assistant).toMatchObject({
      type: 'local-jsx',
      name: 'assistant',
      description: 'Discover and attach to a running assistant session',
    })
  })
})
