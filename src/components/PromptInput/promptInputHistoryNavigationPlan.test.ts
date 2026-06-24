import { describe, expect, it } from 'bun:test'
import {
  resolvePromptInputFooterEntryPlan,
  resolvePromptInputHistoryUpAction,
  shouldHandlePromptInputHistoryDown,
} from './promptInputHistoryNavigationPlan.js'

describe('resolvePromptInputHistoryUpAction', () => {
  it('blocks history-up when multiple suggestions are visible or the cursor is not on the first line', () => {
    expect(
      resolvePromptInputHistoryUpAction({
        suggestionCount: 2,
        isCursorOnFirstLine: true,
        hasEditableQueuedCommand: true,
      }),
    ).toBe('noop')

    expect(
      resolvePromptInputHistoryUpAction({
        suggestionCount: 0,
        isCursorOnFirstLine: false,
        hasEditableQueuedCommand: true,
      }),
    ).toBe('noop')
  })

  it('prefers queued-command editing before history navigation', () => {
    expect(
      resolvePromptInputHistoryUpAction({
        suggestionCount: 0,
        isCursorOnFirstLine: true,
        hasEditableQueuedCommand: true,
      }),
    ).toBe('pop_queue')
  })

  it('falls back to history-up when the navigation guards pass', () => {
    expect(
      resolvePromptInputHistoryUpAction({
        suggestionCount: 1,
        isCursorOnFirstLine: true,
        hasEditableQueuedCommand: false,
      }),
    ).toBe('history_up')
  })
})

describe('shouldHandlePromptInputHistoryDown', () => {
  it('only allows history/footer down navigation when suggestions are bounded and the cursor is on the last line', () => {
    expect(
      shouldHandlePromptInputHistoryDown({
        suggestionCount: 2,
        isCursorOnLastLine: true,
      }),
    ).toBe(false)

    expect(
      shouldHandlePromptInputHistoryDown({
        suggestionCount: 1,
        isCursorOnLastLine: false,
      }),
    ).toBe(false)

    expect(
      shouldHandlePromptInputHistoryDown({
        suggestionCount: 1,
        isCursorOnLastLine: true,
      }),
    ).toBe(true)
  })
})

describe('resolvePromptInputFooterEntryPlan', () => {
  it('selects the first visible footer item only after history-down enters the footer', () => {
    expect(
      resolvePromptInputFooterEntryPlan({
        enteredFooter: false,
        footerItems: ['tasks', 'tmux'],
      }),
    ).toEqual({
      shouldSelectFooterItem: false,
      footerItem: null,
      shouldMarkTasksHintSeen: false,
    })

    expect(
      resolvePromptInputFooterEntryPlan({
        enteredFooter: true,
        footerItems: ['tasks', 'tmux'],
      }),
    ).toEqual({
      shouldSelectFooterItem: true,
      footerItem: 'tasks',
      shouldMarkTasksHintSeen: true,
    })

    expect(
      resolvePromptInputFooterEntryPlan({
        enteredFooter: true,
        footerItems: ['bridge'],
      }),
    ).toEqual({
      shouldSelectFooterItem: true,
      footerItem: 'bridge',
      shouldMarkTasksHintSeen: false,
    })
  })
})
