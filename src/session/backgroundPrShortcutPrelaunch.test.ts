import { describe, expect, it } from 'bun:test'
import { dispatchBackgroundPrShortcutPrelaunch } from './backgroundPrShortcutPrelaunch.js'

describe('dispatchBackgroundPrShortcutPrelaunch', () => {
  it('runs the existing prelaunch bookkeeping before dispatching the background task', async () => {
    const events: string[] = []

    await dispatchBackgroundPrShortcutPrelaunch(
      {
        shouldAddToHistory: true,
        input: '& ship it',
        prompt: 'ship it',
        mainLoopModel: 'gpt-test',
        pastedContents: {
          1: {
            id: 1,
            type: 'text',
            content: 'attachment',
          },
        },
        getInputValue: () => '& ship it',
        helpers: {
          setCursorOffset: offset => {
            events.push(`setCursorOffset:${offset}`)
          },
          clearBuffer: () => {
            events.push('clearBuffer')
          },
        },
      },
      {
        addToHistory: entry => {
          events.push(`addToHistory:${entry.display}:${Object.keys(entry.pastedContents).length}`)
        },
        setInputValue: value => {
          events.push(`setInputValue:${value}`)
        },
        setPastedContents: value => {
          events.push(`setPastedContents:${Object.keys(value).length}`)
        },
        setInputMode: mode => {
          events.push(`setInputMode:${mode}`)
        },
        setIDESelection: value => {
          events.push(`setIDESelection:${String(value)}`)
        },
        incrementSubmitCount: () => {
          events.push('incrementSubmitCount')
        },
        addNotification: () => {},
        createAbortController: () => new AbortController(),
        getMessages: () => [],
        getToolUseContext: () => ({}) as never,
        setMessages: () => {},
        dispatchBackgroundPrShortcutImpl: async options => {
          events.push(`dispatch:${options.input}:${options.prompt}:${options.mainLoopModel}`)
        },
      },
    )

    expect(events).toEqual([
      'addToHistory:& ship it:1',
      'setInputValue:',
      'setCursorOffset:0',
      'setPastedContents:0',
      'setInputMode:prompt',
      'setIDESelection:undefined',
      'incrementSubmitCount',
      'clearBuffer',
      'dispatch:& ship it:ship it:gpt-test',
    ])
  })

  it('preserves the existing prompt when the submitted shortcut does not match the live draft', async () => {
    const events: string[] = []

    await dispatchBackgroundPrShortcutPrelaunch(
      {
        shouldAddToHistory: false,
        input: '& ship it',
        prompt: 'ship it',
        mainLoopModel: 'gpt-test',
        pastedContents: {},
        getInputValue: () => 'user draft',
        helpers: {
          setCursorOffset: () => {
            events.push('setCursorOffset')
          },
          clearBuffer: () => {
            events.push('clearBuffer')
          },
        },
      },
      {
        addToHistory: () => {
          events.push('addToHistory')
        },
        setInputValue: () => {
          events.push('setInputValue')
        },
        setPastedContents: value => {
          events.push(`setPastedContents:${Object.keys(value).length}`)
        },
        setInputMode: mode => {
          events.push(`setInputMode:${mode}`)
        },
        setIDESelection: value => {
          events.push(`setIDESelection:${String(value)}`)
        },
        incrementSubmitCount: () => {
          events.push('incrementSubmitCount')
        },
        addNotification: () => {},
        createAbortController: () => new AbortController(),
        getMessages: () => [],
        getToolUseContext: () => ({}) as never,
        setMessages: () => {},
        dispatchBackgroundPrShortcutImpl: async () => {
          events.push('dispatch')
        },
      },
    )

    expect(events).toEqual([
      'setPastedContents:0',
      'setInputMode:prompt',
      'setIDESelection:undefined',
      'incrementSubmitCount',
      'clearBuffer',
      'dispatch',
    ])
  })
})
