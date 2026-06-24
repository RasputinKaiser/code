import { describe, expect, it } from 'bun:test'
import { resolvePromptInputTextPastePlan } from './promptInputTextPastePlan.js'

describe('resolvePromptInputTextPastePlan', () => {
  it('switches modes for pasted mode-prefixed input when the draft is empty', () => {
    expect(
      resolvePromptInputTextPastePlan({
        sanitizedText: '!ls -la',
        inputLength: 0,
        rows: 24,
        nextPasteId: 7,
      }),
    ).toEqual({
      nextMode: 'bash',
      textToInsert: 'ls -la',
      newPastedContent: null,
    })
  })

  it('keeps short pastes inline', () => {
    expect(
      resolvePromptInputTextPastePlan({
        sanitizedText: 'short paste',
        inputLength: 5,
        rows: 24,
        nextPasteId: 7,
      }),
    ).toEqual({
      nextMode: null,
      textToInsert: 'short paste',
      newPastedContent: null,
    })
  })

  it('collapses long pasted text into a pasted-text reference', () => {
    const longText = Array.from({ length: 20 }, (_, index) => `line ${index}`)
      .join('\n')

    expect(
      resolvePromptInputTextPastePlan({
        sanitizedText: longText,
        inputLength: 0,
        rows: 24,
        nextPasteId: 11,
      }),
    ).toEqual({
      nextMode: null,
      textToInsert: '[Pasted text #11 +19 lines]',
      newPastedContent: {
        id: 11,
        type: 'text',
        content: longText,
      },
    })
  })
})
