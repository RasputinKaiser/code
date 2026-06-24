import { describe, expect, it } from 'bun:test'
import {
  resolvePromptInputEscapeAction,
  shouldCloseHelpOnEmptyDelete,
  shouldExitPromptInputSpecialModeAtStart,
} from './promptInputEscapePlan.js'

describe('resolvePromptInputEscapeAction', () => {
  it('preserves the existing escape priority order', () => {
    expect(
      resolvePromptInputEscapeAction({
        speculationActive: true,
        sideQuestionVisible: true,
        helpOpen: true,
        footerItemSelected: true,
        hasEditableQueuedCommand: true,
        hasMessages: true,
        input: '',
        isLoading: false,
      }),
    ).toBe('abort_speculation')

    expect(
      resolvePromptInputEscapeAction({
        speculationActive: false,
        sideQuestionVisible: true,
        helpOpen: true,
        footerItemSelected: true,
        hasEditableQueuedCommand: true,
        hasMessages: true,
        input: '',
        isLoading: false,
      }),
    ).toBe('dismiss_side_question')

    expect(
      resolvePromptInputEscapeAction({
        speculationActive: false,
        sideQuestionVisible: false,
        helpOpen: true,
        footerItemSelected: true,
        hasEditableQueuedCommand: true,
        hasMessages: true,
        input: '',
        isLoading: false,
      }),
    ).toBe('close_help')
  })

  it('lets footer/queue/double-press cases fall through in the existing order', () => {
    expect(
      resolvePromptInputEscapeAction({
        speculationActive: false,
        sideQuestionVisible: false,
        helpOpen: false,
        footerItemSelected: true,
        hasEditableQueuedCommand: true,
        hasMessages: true,
        input: '',
        isLoading: false,
      }),
    ).toBe('footer_handles_escape')

    expect(
      resolvePromptInputEscapeAction({
        speculationActive: false,
        sideQuestionVisible: false,
        helpOpen: false,
        footerItemSelected: false,
        hasEditableQueuedCommand: true,
        hasMessages: true,
        input: '',
        isLoading: false,
      }),
    ).toBe('pop_queued_commands')

    expect(
      resolvePromptInputEscapeAction({
        speculationActive: false,
        sideQuestionVisible: false,
        helpOpen: false,
        footerItemSelected: false,
        hasEditableQueuedCommand: false,
        hasMessages: true,
        input: '',
        isLoading: false,
      }),
    ).toBe('double_press_empty')
  })

  it('returns noop when no escape branch should fire', () => {
    expect(
      resolvePromptInputEscapeAction({
        speculationActive: false,
        sideQuestionVisible: false,
        helpOpen: false,
        footerItemSelected: false,
        hasEditableQueuedCommand: false,
        hasMessages: false,
        input: 'draft',
        isLoading: true,
      }),
    ).toBe('noop')
  })
})

describe('shouldExitPromptInputSpecialModeAtStart', () => {
  it('only exits special modes from cursor zero on escape/delete/backspace/ctrl+u', () => {
    expect(
      shouldExitPromptInputSpecialModeAtStart({
        cursorOffset: 0,
        isEscape: true,
        isBackspace: false,
        isDelete: false,
        isCtrlU: false,
      }),
    ).toBe(true)

    expect(
      shouldExitPromptInputSpecialModeAtStart({
        cursorOffset: 0,
        isEscape: false,
        isBackspace: false,
        isDelete: false,
        isCtrlU: true,
      }),
    ).toBe(true)

    expect(
      shouldExitPromptInputSpecialModeAtStart({
        cursorOffset: 3,
        isEscape: true,
        isBackspace: false,
        isDelete: false,
        isCtrlU: false,
      }),
    ).toBe(false)
  })
})

describe('shouldCloseHelpOnEmptyDelete', () => {
  it('only closes help for empty-input delete/backspace cases', () => {
    expect(
      shouldCloseHelpOnEmptyDelete({
        helpOpen: true,
        input: '',
        isBackspace: true,
        isDelete: false,
      }),
    ).toBe(true)

    expect(
      shouldCloseHelpOnEmptyDelete({
        helpOpen: true,
        input: 'draft',
        isBackspace: true,
        isDelete: false,
      }),
    ).toBe(false)

    expect(
      shouldCloseHelpOnEmptyDelete({
        helpOpen: false,
        input: '',
        isBackspace: true,
        isDelete: false,
      }),
    ).toBe(false)
  })
})
