import { describe, expect, it } from 'bun:test'
import type { PastedContent } from '../../utils/config.js'
import { dispatchPromptInputChange } from './promptInputChangeDispatch.js'

function createDeps(events: string[]) {
  return {
    toggleHelp: () => {
      events.push('toggleHelp')
    },
    closeHelp: () => {
      events.push('closeHelp')
    },
    dismissStashHint: () => {
      events.push('dismissStashHint')
    },
    abortPromptSuggestion: () => {
      events.push('abortPromptSuggestion')
    },
    abortSpeculation: () => {
      events.push('abortSpeculation')
    },
    onModeChange: (mode: 'prompt' | 'bash' | 'plan') => {
      events.push(`onModeChange:${mode}`)
    },
    pushToBuffer: (
      text: string,
      cursorOffset: number,
      pastedContents: Record<number, PastedContent>,
    ) => {
      events.push(
        `pushToBuffer:${text}:${cursorOffset}:${Object.keys(pastedContents).length}`,
      )
    },
    trackAndSetInput: (value: string) => {
      events.push(`trackAndSetInput:${value}`)
    },
    setCursorOffset: (offset: number) => {
      events.push(`setCursorOffset:${offset}`)
    },
    clearFooterSelection: () => {
      events.push('clearFooterSelection')
    },
  }
}

describe('dispatchPromptInputChange', () => {
  it('toggles help without running the normal editing side effects', () => {
    const events: string[] = []

    const plan = dispatchPromptInputChange(
      {
        value: '?',
        input: '',
        cursorOffset: 0,
        pastedContents: {},
      },
      createDeps(events),
    )

    expect(plan).toEqual({ kind: 'toggle_help' })
    expect(events).toEqual(['toggleHelp'])
  })

  it('applies mode changes with normalized prefixless input state', () => {
    const events: string[] = []

    const plan = dispatchPromptInputChange(
      {
        value: '!',
        input: '',
        cursorOffset: 0,
        pastedContents: {},
      },
      createDeps(events),
    )

    expect(plan).toEqual({
      kind: 'change_mode_and_input',
      nextMode: 'bash',
      nextValue: '',
      nextCursorOffset: 0,
      shouldPushToBuffer: true,
    })
    expect(events).toEqual([
      'closeHelp',
      'dismissStashHint',
      'abortPromptSuggestion',
      'abortSpeculation',
      'onModeChange:bash',
      'pushToBuffer::0:0',
      'trackAndSetInput:',
      'setCursorOffset:0',
    ])
  })

  it('preserves mode-and-input ordering, including buffer push before input/cursor writes', () => {
    const events: string[] = []

    const plan = dispatchPromptInputChange(
      {
        value: '!ls',
        input: '',
        cursorOffset: 0,
        pastedContents: {
          1: {
            id: 1,
            type: 'text',
            content: 'attachment',
          },
        },
      },
      createDeps(events),
    )

    expect(plan).toEqual({
      kind: 'change_mode_and_input',
      nextMode: 'bash',
      nextValue: 'ls',
      nextCursorOffset: 2,
      shouldPushToBuffer: true,
    })
    expect(events).toEqual([
      'closeHelp',
      'dismissStashHint',
      'abortPromptSuggestion',
      'abortSpeculation',
      'onModeChange:bash',
      'pushToBuffer::0:1',
      'trackAndSetInput:ls',
      'setCursorOffset:2',
    ])
  })

  it('preserves input-update ordering including buffer push and footer deselection', () => {
    const events: string[] = []

    const plan = dispatchPromptInputChange(
      {
        value: 'hello world',
        input: 'hello',
        cursorOffset: 5,
        pastedContents: {},
      },
      createDeps(events),
    )

    expect(plan).toEqual({
      kind: 'update_input',
      nextValue: 'hello world',
      shouldPushToBuffer: true,
      shouldClearFooterSelection: true,
    })
    expect(events).toEqual([
      'closeHelp',
      'dismissStashHint',
      'abortPromptSuggestion',
      'abortSpeculation',
      'pushToBuffer:hello:5:0',
      'clearFooterSelection',
      'trackAndSetInput:hello world',
    ])
  })
})
