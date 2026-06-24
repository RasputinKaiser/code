import { describe, expect, it } from 'bun:test'
import { insertBlockAfterToolResults } from './contentArray.js'

describe('insertBlockAfterToolResults', () => {
  it('inserts after the last tool_result block and appends a text continuation when needed', () => {
    const content = [
      { type: 'text', text: 'before' },
      { type: 'tool_result', tool_use_id: 'tool-1', content: 'one' },
      { type: 'tool_result', tool_use_id: 'tool-2', content: 'two' },
    ]

    insertBlockAfterToolResults(content, { type: 'cache_control', mode: 'ephemeral' })

    expect(content).toEqual([
      { type: 'text', text: 'before' },
      { type: 'tool_result', tool_use_id: 'tool-1', content: 'one' },
      { type: 'tool_result', tool_use_id: 'tool-2', content: 'two' },
      { type: 'cache_control', mode: 'ephemeral' },
      { type: 'text', text: '.' },
    ])
  })

  it('inserts before the last block when there are no tool results', () => {
    const content = [
      { type: 'text', text: 'alpha' },
      { type: 'text', text: 'omega' },
    ]

    insertBlockAfterToolResults(content, { type: 'attachment', id: 'att-1' })

    expect(content).toEqual([
      { type: 'text', text: 'alpha' },
      { type: 'attachment', id: 'att-1' },
      { type: 'text', text: 'omega' },
    ])
  })
})
