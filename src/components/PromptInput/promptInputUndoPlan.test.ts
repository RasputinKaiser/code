import { describe, expect, it } from 'bun:test'
import { resolvePromptInputUndoPlan } from './promptInputUndoPlan.js'

describe('resolvePromptInputUndoPlan', () => {
  it('returns noop when the input buffer has no undo entry', () => {
    expect(resolvePromptInputUndoPlan(undefined)).toEqual({
      kind: 'noop',
    })
  })

  it('restores text, cursor, and pasted contents from the prior buffer entry', () => {
    expect(
      resolvePromptInputUndoPlan({
        text: 'previous draft',
        cursorOffset: 4,
        pastedContents: {
          3: {
            id: 3,
            type: 'text',
            content: 'saved attachment',
          },
        },
        timestamp: 123,
      }),
    ).toEqual({
      kind: 'restore',
      nextInput: 'previous draft',
      nextCursorOffset: 4,
      nextPastedContents: {
        3: {
          id: 3,
          type: 'text',
          content: 'saved attachment',
        },
      },
    })
  })
})
