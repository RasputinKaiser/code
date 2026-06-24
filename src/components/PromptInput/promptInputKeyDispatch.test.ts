import { describe, expect, test } from 'bun:test'

import {
  dispatchPromptInputEscape,
  dispatchPromptInputFooterTypeToExit,
  dispatchPromptInputSpecialModeExit,
  dispatchPromptInputUseInput,
} from './promptInputKeyDispatch.js'

describe('dispatchPromptInputFooterTypeToExit', () => {
  test('preserves footer type-to-exit insertion ordering', () => {
    const events: string[] = []

    const handled = dispatchPromptInputFooterTypeToExit(
      {
        footerItemSelected: true,
        char: 'x',
        isCtrl: false,
        isMeta: false,
        isEscape: false,
        isReturn: false,
        input: 'ab',
        cursorOffset: 1,
      },
      {
        applyInputChange: value => {
          events.push(`input:${value}`)
        },
        setCursorOffset: value => {
          events.push(`cursor:${value}`)
        },
      },
    )

    expect(handled).toBe(true)
    expect(events).toEqual([
      'input:axb',
      'cursor:2',
    ])
  })
})

describe('dispatchPromptInputSpecialModeExit', () => {
  test('preserves mode-exit and help-close side effects', () => {
    const events: string[] = []

    dispatchPromptInputSpecialModeExit(
      {
        shouldExitSpecialMode: true,
        shouldCloseHelpOnEmptyDelete: true,
      },
      {
        setModePrompt: () => {
          events.push('mode:prompt')
        },
        closeHelp: () => {
          events.push('help:close')
        },
      },
    )

    expect(events).toEqual([
      'mode:prompt',
      'help:close',
      'help:close',
    ])
  })
})

describe('dispatchPromptInputEscape', () => {
  test('preserves queued-command escape handling', () => {
    const events: string[] = []

    const handled = dispatchPromptInputEscape(
      {
        speculationActive: false,
        sideQuestionVisible: false,
        helpOpen: false,
        footerItemSelected: false,
        hasEditableQueuedCommand: true,
        hasMessages: true,
        input: '',
        isLoading: false,
      },
      {
        abortSpeculation: () => {
          events.push('abort')
        },
        dismissSideQuestion: () => {
          events.push('side')
        },
        closeHelp: () => {
          events.push('help')
        },
        popQueuedCommands: () => {
          events.push('queue')
        },
        doublePressEmpty: () => {
          events.push('double')
        },
      },
    )

    expect(handled).toBe(true)
    expect(events).toEqual(['queue'])
  })

  test('preserves empty double-press escape handling', () => {
    const events: string[] = []

    const handled = dispatchPromptInputEscape(
      {
        speculationActive: false,
        sideQuestionVisible: false,
        helpOpen: false,
        footerItemSelected: false,
        hasEditableQueuedCommand: false,
        hasMessages: true,
        input: '',
        isLoading: false,
      },
      {
        abortSpeculation: () => {
          events.push('abort')
        },
        dismissSideQuestion: () => {
          events.push('side')
        },
        closeHelp: () => {
          events.push('help')
        },
        popQueuedCommands: () => {
          events.push('queue')
        },
        doublePressEmpty: () => {
          events.push('double')
        },
      },
    )

    expect(handled).toBe(true)
    expect(events).toEqual(['double'])
  })
})

describe('dispatchPromptInputUseInput', () => {
  test('preserves footer type-to-exit precedence over help-close and escape logic', () => {
    const events: string[] = []

    const handled = dispatchPromptInputUseInput(
      {
        footerItemSelected: true,
        char: 'x',
        isCtrl: false,
        isMeta: false,
        isEscape: false,
        isReturn: false,
        isBackspace: false,
        isDelete: false,
        input: 'ab',
        cursorOffset: 1,
        helpOpen: true,
        speculationActive: false,
        sideQuestionVisible: false,
        hasEditableQueuedCommand: false,
        hasMessages: true,
        isLoading: false,
      },
      {
        applyInputChange: value => {
          events.push(`input:${value}`)
        },
        setCursorOffset: value => {
          events.push(`cursor:${value}`)
        },
        setModePrompt: () => {
          events.push('mode:prompt')
        },
        closeHelp: () => {
          events.push('help:close')
        },
        abortSpeculation: () => {
          events.push('abort')
        },
        dismissSideQuestion: () => {
          events.push('side')
        },
        popQueuedCommands: () => {
          events.push('queue')
        },
        doublePressEmpty: () => {
          events.push('double')
        },
      },
    )

    expect(handled).toBe(true)
    expect(events).toEqual(['input:axb', 'cursor:2'])
  })

  test('preserves special-mode exit before escape handling and help enter dismissal', () => {
    const events: string[] = []

    const handled = dispatchPromptInputUseInput(
      {
        footerItemSelected: false,
        char: undefined,
        isCtrl: false,
        isMeta: false,
        isEscape: false,
        isReturn: true,
        isBackspace: false,
        isDelete: false,
        input: '',
        cursorOffset: 0,
        helpOpen: true,
        speculationActive: false,
        sideQuestionVisible: false,
        hasEditableQueuedCommand: false,
        hasMessages: true,
        isLoading: false,
      },
      {
        applyInputChange: value => {
          events.push(`input:${value}`)
        },
        setCursorOffset: value => {
          events.push(`cursor:${value}`)
        },
        setModePrompt: () => {
          events.push('mode:prompt')
        },
        closeHelp: () => {
          events.push('help:close')
        },
        abortSpeculation: () => {
          events.push('abort')
        },
        dismissSideQuestion: () => {
          events.push('side')
        },
        popQueuedCommands: () => {
          events.push('queue')
        },
        doublePressEmpty: () => {
          events.push('double')
        },
      },
    )

    expect(handled).toBe(true)
    expect(events).toEqual(['help:close'])
  })
})
