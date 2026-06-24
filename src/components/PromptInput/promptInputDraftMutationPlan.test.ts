import { describe, expect, it } from 'bun:test'
import {
  insertTextAtCursorState,
  resolvePromptInputExternalEditorApplyPlan,
  resolvePromptInputStashPlan,
} from './promptInputDraftMutationPlan.js'

describe('insertTextAtCursorState', () => {
  it('inserts text at the cursor and advances the cursor by inserted length', () => {
    expect(
      insertTextAtCursorState({
        input: 'hello world',
        cursorOffset: 5,
        text: ', there',
      }),
    ).toEqual({
      nextInput: 'hello, there world',
      nextCursorOffset: 12,
    })
  })
})

describe('resolvePromptInputExternalEditorApplyPlan', () => {
  it('skips apply when the editor returns null or unchanged content', () => {
    expect(
      resolvePromptInputExternalEditorApplyPlan({
        input: 'hello',
        resultContent: null,
      }),
    ).toEqual({
      shouldApply: false,
      nextInput: 'hello',
      nextCursorOffset: 5,
    })

    expect(
      resolvePromptInputExternalEditorApplyPlan({
        input: 'hello',
        resultContent: 'hello',
      }),
    ).toEqual({
      shouldApply: false,
      nextInput: 'hello',
      nextCursorOffset: 5,
    })
  })

  it('applies edited content and moves the cursor to the end', () => {
    expect(
      resolvePromptInputExternalEditorApplyPlan({
        input: 'hello',
        resultContent: 'hello from editor',
      }),
    ).toEqual({
      shouldApply: true,
      nextInput: 'hello from editor',
      nextCursorOffset: 'hello from editor'.length,
    })
  })
})

describe('resolvePromptInputStashPlan', () => {
  it('restores the stash when the draft is empty', () => {
    expect(
      resolvePromptInputStashPlan({
        input: '   ',
        cursorOffset: 0,
        stashedPrompt: {
          text: 'saved draft',
          cursorOffset: 4,
          pastedContents: {
            1: {
              id: 1,
              type: 'text',
              content: 'saved attachment',
            },
          },
        },
        pastedContents: {},
      }),
    ).toEqual({
      kind: 'restore',
      nextInput: 'saved draft',
      nextCursorOffset: 4,
      nextPastedContents: {
        1: {
          id: 1,
          type: 'text',
          content: 'saved attachment',
        },
      },
      nextStash: undefined,
    })
  })

  it('stashes the current draft and clears the live input when text is present', () => {
    expect(
      resolvePromptInputStashPlan({
        input: 'current draft',
        cursorOffset: 7,
        stashedPrompt: undefined,
        pastedContents: {
          2: {
            id: 2,
            type: 'text',
            content: 'current attachment',
          },
        },
      }),
    ).toEqual({
      kind: 'stash',
      nextInput: '',
      nextCursorOffset: 0,
      nextPastedContents: {},
      nextStash: {
        text: 'current draft',
        cursorOffset: 7,
        pastedContents: {
          2: {
            id: 2,
            type: 'text',
            content: 'current attachment',
          },
        },
      },
    })
  })

  it('no-ops when there is neither live input nor stash', () => {
    expect(
      resolvePromptInputStashPlan({
        input: '   ',
        cursorOffset: 0,
        stashedPrompt: undefined,
        pastedContents: {},
      }),
    ).toEqual({
      kind: 'noop',
    })
  })
})
