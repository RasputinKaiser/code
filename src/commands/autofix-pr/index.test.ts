import { describe, expect, it } from 'bun:test'
import autofixPr from './index.js'

describe('/autofix-pr command', () => {
  it('is a public claude-ai local-jsx launcher', () => {
    expect(autofixPr).toMatchObject({
      type: 'local-jsx',
      name: 'autofix-pr',
      availability: ['claude-ai'],
      argumentHint: '[prompt]',
      description:
        'Watch the current PR and push fixes for CI failures or review comments',
    })
  })
})
