import { describe, expect, test } from 'bun:test'

import { dispatchReplIdleReturnDialogAction } from './replIdleReturnDialogAction.js'

describe('dispatchReplIdleReturnDialogAction', () => {
  test('dismiss restores the pending input without skip-or-resubmit side effects', async () => {
    const events: string[] = []

    await dispatchReplIdleReturnDialogAction(
      {
        action: 'dismiss',
        pending: {
          input: 'keep going',
          idleMinutes: 91.8,
        },
      },
      {
        closeDialog: () => {
          events.push('dialog:close')
        },
        logIdleReturnAction: (action, idleMinutes) => {
          events.push(`log:${action}:${idleMinutes}`)
        },
        restorePendingInput: input => {
          events.push(`restore:${input}`)
        },
        persistNeverDismiss: () => {
          events.push('persist:never')
        },
        clearConversation: async () => {
          events.push('clear')
        },
        resetClearedConversationLocalState: () => {
          events.push('reset')
        },
        markSkipIdleCheck: () => {
          events.push('skip')
        },
        resubmitPendingInput: input => {
          events.push(`submit:${input}`)
        },
      },
    )

    expect(events).toEqual([
      'dialog:close',
      'log:dismiss:92',
      'restore:keep going',
    ])
  })

  test('never persists dismissal and then resubmits with skip-idle-check', async () => {
    const events: string[] = []

    await dispatchReplIdleReturnDialogAction(
      {
        action: 'never',
        pending: {
          input: 'resume work',
          idleMinutes: 100.4,
        },
      },
      {
        closeDialog: () => {
          events.push('dialog:close')
        },
        logIdleReturnAction: (action, idleMinutes) => {
          events.push(`log:${action}:${idleMinutes}`)
        },
        restorePendingInput: input => {
          events.push(`restore:${input}`)
        },
        persistNeverDismiss: () => {
          events.push('persist:never')
        },
        clearConversation: async () => {
          events.push('clear')
        },
        resetClearedConversationLocalState: () => {
          events.push('reset')
        },
        markSkipIdleCheck: () => {
          events.push('skip')
        },
        resubmitPendingInput: input => {
          events.push(`submit:${input}`)
        },
      },
    )

    expect(events).toEqual([
      'dialog:close',
      'log:never:100',
      'persist:never',
      'skip',
      'submit:resume work',
    ])
  })

  test('clear awaits conversation reset before resubmitting', async () => {
    const events: string[] = []

    await dispatchReplIdleReturnDialogAction(
      {
        action: 'clear',
        pending: {
          input: 'fresh start',
          idleMinutes: 150.2,
        },
      },
      {
        closeDialog: () => {
          events.push('dialog:close')
        },
        logIdleReturnAction: (action, idleMinutes) => {
          events.push(`log:${action}:${idleMinutes}`)
        },
        restorePendingInput: input => {
          events.push(`restore:${input}`)
        },
        persistNeverDismiss: () => {
          events.push('persist:never')
        },
        clearConversation: async () => {
          events.push('clear:start')
          await Promise.resolve()
          events.push('clear:done')
        },
        resetClearedConversationLocalState: () => {
          events.push('reset')
        },
        markSkipIdleCheck: () => {
          events.push('skip')
        },
        resubmitPendingInput: input => {
          events.push(`submit:${input}`)
        },
      },
    )

    expect(events).toEqual([
      'dialog:close',
      'log:clear:150',
      'clear:start',
      'clear:done',
      'reset',
      'skip',
      'submit:fresh start',
    ])
  })
})
