import { describe, expect, test } from 'bun:test'

import {
  dispatchPromptInputExternalEditor,
  dispatchPromptInputNewline,
  dispatchPromptInputQueuedCommandRestore,
  dispatchPromptInputStash,
} from './promptInputEditingDispatch.js'

describe('dispatchPromptInputQueuedCommandRestore', () => {
  test('preserves queued-command restore ordering and prompt-mode apply', () => {
    const events: string[] = []

    const handled = dispatchPromptInputQueuedCommandRestore(
      {
        result: {
          text: '/ship it',
          cursorOffset: 3,
          images: [],
        },
        existingPastedContents: {},
      },
      {
        setInputValue: value => {
          events.push(`input:${value}`)
        },
        setModePrompt: () => {
          events.push('mode:prompt')
        },
        setCursorOffset: value => {
          events.push(`cursor:${value}`)
        },
        setPastedContents: value => {
          events.push(`pasted:${Object.keys(value).length}`)
        },
      },
    )

    expect(handled).toBe(true)
    expect(events).toEqual([
      'input:/ship it',
      'mode:prompt',
      'cursor:3',
      'pasted:0',
    ])
  })
})

describe('dispatchPromptInputNewline', () => {
  test('pushes the current state before inserting a newline at the cursor', () => {
    const events: string[] = []

    dispatchPromptInputNewline(
      {
        input: 'abc',
        cursorOffset: 1,
        pastedContents: {},
      },
      {
        pushToBuffer: (input, cursorOffset) => {
          events.push(`buffer:${input}:${cursorOffset}`)
        },
        setInputValue: value => {
          events.push(`input:${value}`)
        },
        setCursorOffset: value => {
          events.push(`cursor:${value}`)
        },
      },
    )

    expect(events).toEqual([
      'buffer:abc:1',
      'input:a\nbc',
      'cursor:2',
    ])
  })
})

describe('dispatchPromptInputExternalEditor', () => {
  test('preserves editor apply ordering and buffer push', async () => {
    const events: string[] = []

    await dispatchPromptInputExternalEditor(
      {
        input: 'hello',
        cursorOffset: 2,
        pastedContents: {},
      },
      {
        logEditorUsed: () => {
          events.push('log')
        },
        setExternalEditorActive: value => {
          events.push(`active:${value}`)
        },
        editPromptInEditorImpl: async () => ({
          content: 'hello world',
        }),
        addNotification: options => {
          events.push(`notify:${options.text}`)
        },
        logErrorImpl: err => {
          events.push(`error:${err.message}`)
        },
        pushToBuffer: (input, cursorOffset) => {
          events.push(`buffer:${input}:${cursorOffset}`)
        },
        setInputValue: value => {
          events.push(`input:${value}`)
        },
        setCursorOffset: value => {
          events.push(`cursor:${value}`)
        },
      },
    )

    expect(events).toEqual([
      'log',
      'active:true',
      'buffer:hello:2',
      'input:hello world',
      'cursor:11',
      'active:false',
    ])
  })

  test('preserves editor failure notification and active cleanup', async () => {
    const events: string[] = []

    await dispatchPromptInputExternalEditor(
      {
        input: 'hello',
        cursorOffset: 2,
        pastedContents: {},
      },
      {
        logEditorUsed: () => {
          events.push('log')
        },
        setExternalEditorActive: value => {
          events.push(`active:${value}`)
        },
        editPromptInEditorImpl: async () => {
          throw new Error('boom')
        },
        addNotification: options => {
          events.push(`notify:${options.text}`)
        },
        logErrorImpl: err => {
          events.push(`error:${err.message}`)
        },
        pushToBuffer: () => {
          events.push('buffer')
        },
        setInputValue: value => {
          events.push(`input:${value}`)
        },
        setCursorOffset: value => {
          events.push(`cursor:${value}`)
        },
      },
    )

    expect(events).toEqual([
      'log',
      'active:true',
      'error:boom',
      'notify:External editor failed: boom',
      'active:false',
    ])
  })
})

describe('dispatchPromptInputStash', () => {
  test('preserves stash ordering and marks stash usage only on stash', () => {
    const events: string[] = []

    dispatchPromptInputStash(
      {
        input: 'save this',
        cursorOffset: 4,
        stashedPrompt: undefined,
        pastedContents: {},
      },
      {
        setStashedPrompt: value => {
          events.push(`stash:${value ? value.text : 'none'}`)
        },
        setInputValue: value => {
          events.push(`input:${value}`)
        },
        setCursorOffset: value => {
          events.push(`cursor:${value}`)
        },
        setPastedContents: value => {
          events.push(`pasted:${Object.keys(value).length}`)
        },
        markStashUsed: () => {
          events.push('mark:used')
        },
      },
    )

    expect(events).toEqual([
      'stash:save this',
      'input:',
      'cursor:0',
      'pasted:0',
      'mark:used',
    ])
  })
})
