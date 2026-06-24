import { describe, expect, test } from 'bun:test'

import { dispatchReplIdleReturnDialog } from './replIdleReturnDialogDispatch.js'

describe('dispatchReplIdleReturnDialog', () => {
  test('preserves the existing pending-dialog bookkeeping and clear ordering', () => {
    const events: string[] = []

    const handled = dispatchReplIdleReturnDialog(
      {
        input: 'continue from where we left off',
        idleReturnPreflight: {
          shouldOpenDialog: true,
          idleMinutes: 123,
        },
      },
      {
        setIdleReturnPending: value => {
          events.push(`pending:${value.input}:${value.idleMinutes}`)
        },
        setInputValue: value => {
          events.push(`input:${value}`)
        },
        setCursorOffset: value => {
          events.push(`cursor:${value}`)
        },
        clearBuffer: () => {
          events.push('buffer:clear')
        },
      },
    )

    expect(handled).toBe(true)
    expect(events).toEqual([
      'pending:continue from where we left off:123',
      'input:',
      'cursor:0',
      'buffer:clear',
    ])
  })

  test('no-ops when the idle-return dialog should stay closed', () => {
    const events: string[] = []

    const handled = dispatchReplIdleReturnDialog(
      {
        input: 'keep going',
        idleReturnPreflight: {
          shouldOpenDialog: false,
          idleMinutes: 0,
        },
      },
      {
        setIdleReturnPending: () => {
          events.push('pending')
        },
        setInputValue: () => {
          events.push('input')
        },
        setCursorOffset: () => {
          events.push('cursor')
        },
        clearBuffer: () => {
          events.push('buffer')
        },
      },
    )

    expect(handled).toBe(false)
    expect(events).toEqual([])
  })
})
