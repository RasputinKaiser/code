import { describe, expect, test } from 'bun:test'

import { clearCommandQueue, enqueue } from '../utils/messageQueueManager.js'
import { dispatchReplQueuedCommandCancel } from './replQueuedCommandCancelDispatch.js'

describe('dispatchReplQueuedCommandCancel', () => {
  test('restores the last editable queued command and merges pasted contents', () => {
    clearCommandQueue()
    enqueue({
      mode: 'prompt',
      value: 'queued [Pasted text #1]',
      cursorOffset: 6,
      pastedContents: {
        1: {
          id: 1,
          type: 'text',
          content: 'queued text',
        },
      },
    })

    const events: string[] = []
    const handled = dispatchReplQueuedCommandCancel(
      {
        input: 'current',
        existingPastedContents: {
          2: {
            id: 2,
            type: 'text',
            content: 'current text',
          },
        },
      },
      {
        setInputValue: value => {
          events.push(`input:${value}`)
        },
        setModePrompt: () => {
          events.push('mode:prompt')
        },
        setPastedContents: value => {
          events.push(`pastes:${Object.keys(value).sort().join(',')}`)
        },
      },
    )

    expect(handled).toBe(true)
    expect(events).toEqual([
      'input:queued [Pasted text #1]\ncurrent',
      'mode:prompt',
      'pastes:2',
    ])
  })

  test('returns false when there is no editable queued command to restore', () => {
    clearCommandQueue()
    const handled = dispatchReplQueuedCommandCancel(
      {
        input: 'current',
        existingPastedContents: {},
      },
      {
        setInputValue: () => {
          throw new Error('should not restore input')
        },
        setModePrompt: () => {
          throw new Error('should not switch mode')
        },
        setPastedContents: () => {
          throw new Error('should not touch pasted contents')
        },
      },
    )

    expect(handled).toBe(false)
  })
})
