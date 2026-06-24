import { describe, expect, it } from 'bun:test'
import { resolvePromptInputChangePlan } from './promptInputChangePlan.js'

describe('resolvePromptInputChangePlan', () => {
  it('toggles help for a bare question mark', () => {
    expect(
      resolvePromptInputChangePlan({
        value: '?',
        input: '',
        cursorOffset: 0,
      }),
    ).toEqual({
      kind: 'toggle_help',
    })
  })

  it('switches mode and stores a prefixless value for a single leading mode character', () => {
    expect(
      resolvePromptInputChangePlan({
        value: '!',
        input: '',
        cursorOffset: 0,
      }),
    ).toEqual({
      kind: 'change_mode_and_input',
      nextMode: 'bash',
      nextValue: '',
      nextCursorOffset: 0,
      shouldPushToBuffer: true,
    })
  })

  it('switches mode and strips the prefix for multi-char insertion into an empty prompt', () => {
    expect(
      resolvePromptInputChangePlan({
        value: '! gcloud auth\tlogin',
        input: '',
        cursorOffset: 0,
      }),
    ).toEqual({
      kind: 'change_mode_and_input',
      nextMode: 'bash',
      nextValue: ' gcloud auth    login',
      nextCursorOffset: ' gcloud auth    login'.length,
      shouldPushToBuffer: true,
    })
  })

  it('stays on the normal update path when the prompt already has content', () => {
    expect(
      resolvePromptInputChangePlan({
        value: '! gcloud auth\tlogin',
        input: 'existing',
        cursorOffset: 0,
      }),
    ).toEqual({
      kind: 'update_input',
      nextValue: '! gcloud auth    login',
      shouldPushToBuffer: true,
      shouldClearFooterSelection: true,
    })
  })

  it('does not erase existing content when a single mode character is inserted at the start', () => {
    // Regression: typing '!' at the start of a non-empty prompt used to
    // return change_mode_and_input with nextValue: '', destroying prior input.
    expect(
      resolvePromptInputChangePlan({
        value: '!existing',
        input: 'existing',
        cursorOffset: 0,
      }),
    ).toEqual({
      kind: 'update_input',
      nextValue: '!existing',
      shouldPushToBuffer: true,
      shouldClearFooterSelection: true,
    })
  })

  it('normalizes tabs and suppresses undo snapshots when text is unchanged', () => {
    expect(
      resolvePromptInputChangePlan({
        value: 'same text',
        input: 'same text',
        cursorOffset: 4,
      }),
    ).toEqual({
      kind: 'update_input',
      nextValue: 'same text',
      shouldPushToBuffer: false,
      shouldClearFooterSelection: true,
    })
  })
})
