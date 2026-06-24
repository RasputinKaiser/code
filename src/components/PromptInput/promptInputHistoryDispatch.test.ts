import { describe, expect, it, mock } from 'bun:test'
import {
  dispatchPromptInputHistoryDown,
  dispatchPromptInputHistoryUp,
} from './promptInputHistoryDispatch.js'

describe('dispatchPromptInputHistoryUp', () => {
  it('preserves noop gating when suggestions or cursor position block history navigation', () => {
    const popAllCommandsFromQueue = mock(() => {})
    const onHistoryUp = mock(() => {})

    dispatchPromptInputHistoryUp(
      {
        suggestionCount: 2,
        isCursorOnFirstLine: true,
        hasEditableQueuedCommand: true,
      },
      {
        popAllCommandsFromQueue,
        onHistoryUp,
      },
    )

    expect(popAllCommandsFromQueue).not.toHaveBeenCalled()
    expect(onHistoryUp).not.toHaveBeenCalled()
  })

  it('preserves queued-command restore priority over history navigation', () => {
    const calls: string[] = []

    dispatchPromptInputHistoryUp(
      {
        suggestionCount: 0,
        isCursorOnFirstLine: true,
        hasEditableQueuedCommand: true,
      },
      {
        popAllCommandsFromQueue: () => {
          calls.push('pop')
        },
        onHistoryUp: () => {
          calls.push('history')
        },
      },
    )

    expect(calls).toEqual(['pop'])
  })

  it('falls back to history-up when queue restore is not available', () => {
    const calls: string[] = []

    dispatchPromptInputHistoryUp(
      {
        suggestionCount: 1,
        isCursorOnFirstLine: true,
        hasEditableQueuedCommand: false,
      },
      {
        popAllCommandsFromQueue: () => {
          calls.push('pop')
        },
        onHistoryUp: () => {
          calls.push('history')
        },
      },
    )

    expect(calls).toEqual(['history'])
  })
})

describe('dispatchPromptInputHistoryDown', () => {
  it('preserves the existing noop guards when footer entry is blocked', () => {
    const onHistoryDown = mock(() => true)
    const selectFooterItem = mock(() => {})
    const markTasksHintSeen = mock(() => {})

    dispatchPromptInputHistoryDown(
      {
        suggestionCount: 2,
        isCursorOnLastLine: true,
        footerItems: ['tasks', 'tmux'],
        hasSeenTasksHint: false,
      },
      {
        onHistoryDown,
        selectFooterItem,
        markTasksHintSeen,
      },
    )

    expect(onHistoryDown).not.toHaveBeenCalled()
    expect(selectFooterItem).not.toHaveBeenCalled()
    expect(markTasksHintSeen).not.toHaveBeenCalled()
  })

  it('preserves footer entry selection and tasks-hint persistence ordering', () => {
    const calls: string[] = []

    dispatchPromptInputHistoryDown(
      {
        suggestionCount: 1,
        isCursorOnLastLine: true,
        footerItems: ['tasks', 'tmux'],
        hasSeenTasksHint: false,
      },
      {
        onHistoryDown: () => {
          calls.push('enter')
          return true
        },
        selectFooterItem: item => {
          calls.push(`select:${item}`)
        },
        markTasksHintSeen: () => {
          calls.push('mark')
        },
      },
    )

    expect(calls).toEqual(['enter', 'select:tasks', 'mark'])
  })

  it('does not persist the tasks hint when already seen or when the first footer item is not tasks', () => {
    const markTasksHintSeen = mock(() => {})

    dispatchPromptInputHistoryDown(
      {
        suggestionCount: 0,
        isCursorOnLastLine: true,
        footerItems: ['tasks'],
        hasSeenTasksHint: true,
      },
      {
        onHistoryDown: () => true,
        selectFooterItem: () => {},
        markTasksHintSeen,
      },
    )

    dispatchPromptInputHistoryDown(
      {
        suggestionCount: 0,
        isCursorOnLastLine: true,
        footerItems: ['bridge'],
        hasSeenTasksHint: false,
      },
      {
        onHistoryDown: () => true,
        selectFooterItem: () => {},
        markTasksHintSeen,
      },
    )

    expect(markTasksHintSeen).not.toHaveBeenCalled()
  })
})
