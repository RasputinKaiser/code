import { describe, expect, test } from 'bun:test'

import { buildReplPromptContext } from './replPromptContextBuilder.js'

describe('buildReplPromptContext', () => {
  test('builds system/user/system contexts concurrently and returns them', async () => {
    const events: string[] = []
    const context = {} as any

    const result = await buildReplPromptContext(context, {
      buildRenderedSystemPrompt: async () => {
        events.push('system-prompt')
        return 'rendered prompt'
      },
      getUserContext: async () => {
        events.push('user-context')
        return { user: 'ctx' }
      },
      getSystemContext: async () => {
        events.push('system-context')
        return { system: 'ctx' }
      },
    })

    expect(result).toEqual({
      systemPrompt: 'rendered prompt',
      userContext: { user: 'ctx' },
      systemContext: { system: 'ctx' },
    })
    expect(events.sort()).toEqual([
      'system-context',
      'system-prompt',
      'user-context',
    ])
    expect((context as any).renderedSystemPrompt).toBeUndefined()
  })

  test('writes rendered system prompt to context only when requested', async () => {
    const context = {} as any

    await buildReplPromptContext(context, {
      buildRenderedSystemPrompt: async () => 'rendered prompt',
      getUserContext: async () => ({}),
      getSystemContext: async () => ({}),
      setRenderedPromptOnContext: true,
    })

    expect(context.renderedSystemPrompt).toBe('rendered prompt')
  })
})
