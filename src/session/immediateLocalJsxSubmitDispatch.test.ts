import { describe, expect, it } from 'bun:test'
import { dispatchImmediateLocalJsxSubmit } from './immediateLocalJsxSubmitDispatch.js'

describe('dispatchImmediateLocalJsxSubmit', () => {
  it('clears the live prompt only when the submitted command matches the visible input', () => {
    const events: string[] = []

    dispatchImmediateLocalJsxSubmit(
      {
        input: '/config foo',
        getInputValue: () => '/config foo',
        helpers: {
          setCursorOffset: offset => {
            events.push(`setCursorOffset:${offset}`)
          },
          clearBuffer: () => {
            events.push('clearBuffer')
          },
        },
        pastedContents: {},
        command: {
          type: 'local-jsx',
          name: 'config',
          description: 'Config',
          source: 'builtin',
          load: async () => ({
            call: async () => null,
          }),
        },
        commandArgs: 'foo',
        commandName: 'config',
        fromKeybinding: false,
        fullscreenEnabled: false,
        mainLoopModel: 'gpt-test',
        stashedPrompt: undefined,
      },
      {
        setInputValue: value => {
          events.push(`setInputValue:${value}`)
        },
        setPastedContents: value => {
          events.push(`setPastedContents:${Object.keys(value).length}`)
        },
        setStashedPrompt: () => {
          events.push('setStashedPrompt')
        },
        logEvent: (name, payload) => {
          events.push(`${name}:${JSON.stringify(payload)}`)
        },
        addNotification: () => {},
        createAbortController: () => new AbortController(),
        getMessages: () => [],
        getToolUseContext: () => ({}) as never,
        setMessages: () => {},
        setToolJSX: () => {},
        executeImmediateLocalJsxCommandImpl: async () => {
          events.push('executeImmediateLocalJsxCommand')
        },
      },
    )

    expect(events).toEqual([
      'setInputValue:',
      'setCursorOffset:0',
      'clearBuffer',
      'setPastedContents:0',
      'ncode_paste_text:{"pastedTextCount":0,"pastedTextBytes":0}',
      'ncode_immediate_command_executed:{"commandName":"config","fromKeybinding":false}',
      'executeImmediateLocalJsxCommand',
    ])
  })

  it('preserves the existing prompt when the command came from a keybinding over other text', () => {
    const events: string[] = []

    dispatchImmediateLocalJsxSubmit(
      {
        input: '/config',
        getInputValue: () => 'user draft',
        helpers: {
          setCursorOffset: () => {
            events.push('setCursorOffset')
          },
          clearBuffer: () => {
            events.push('clearBuffer')
          },
        },
        pastedContents: {
          7: {
            id: 7,
            type: 'text',
            content: 'attachment body',
          },
        },
        command: {
          type: 'local-jsx',
          name: 'config',
          description: 'Config',
          source: 'builtin',
          load: async () => ({
            call: async () => null,
          }),
        },
        commandArgs: '',
        commandName: 'config',
        fromKeybinding: true,
        fullscreenEnabled: false,
        mainLoopModel: 'gpt-test',
        stashedPrompt: undefined,
      },
      {
        setInputValue: () => {
          events.push('setInputValue')
        },
        setPastedContents: () => {
          events.push('setPastedContents')
        },
        setStashedPrompt: () => {},
        logEvent: (name, payload) => {
          events.push(`${name}:${JSON.stringify(payload)}`)
        },
        addNotification: () => {},
        createAbortController: () => new AbortController(),
        getMessages: () => [],
        getToolUseContext: () => ({}) as never,
        setMessages: () => {},
        setToolJSX: () => {},
        executeImmediateLocalJsxCommandImpl: async () => {
          events.push('executeImmediateLocalJsxCommand')
        },
      },
    )

    expect(events).toEqual([
      'ncode_paste_text:{"pastedTextCount":0,"pastedTextBytes":0}',
      'ncode_immediate_command_executed:{"commandName":"config","fromKeybinding":true}',
      'executeImmediateLocalJsxCommand',
    ])
  })

  it('passes a restore callback when a stashed prompt exists', () => {
    let restoreStashedPrompt: (() => void) | undefined
    const events: string[] = []

    dispatchImmediateLocalJsxSubmit(
      {
        input: '/config',
        getInputValue: () => '/config',
        helpers: {
          setCursorOffset: offset => {
            events.push(`setCursorOffset:${offset}`)
          },
          clearBuffer: () => {
            events.push('clearBuffer')
          },
        },
        pastedContents: {},
        command: {
          type: 'local-jsx',
          name: 'config',
          description: 'Config',
          source: 'builtin',
          load: async () => ({
            call: async () => null,
          }),
        },
        commandArgs: '',
        commandName: 'config',
        fromKeybinding: false,
        fullscreenEnabled: false,
        mainLoopModel: 'gpt-test',
        stashedPrompt: {
          text: 'saved draft',
          cursorOffset: 4,
          pastedContents: {
            9: {
              id: 9,
              type: 'text',
              content: 'saved attachment',
            },
          },
        },
      },
      {
        setInputValue: value => {
          events.push(`setInputValue:${value}`)
        },
        setPastedContents: value => {
          events.push(`setPastedContents:${Object.keys(value).length}`)
        },
        setStashedPrompt: value => {
          events.push(`setStashedPrompt:${String(value === undefined)}`)
        },
        logEvent: () => {},
        addNotification: () => {},
        createAbortController: () => new AbortController(),
        getMessages: () => [],
        getToolUseContext: () => ({}) as never,
        setMessages: () => {},
        setToolJSX: () => {},
        executeImmediateLocalJsxCommandImpl: async options => {
          restoreStashedPrompt = options.restoreStashedPrompt
        },
      },
    )

    expect(typeof restoreStashedPrompt).toBe('function')
    restoreStashedPrompt?.()

    expect(events).toContain('setInputValue:saved draft')
    expect(events).toContain('setCursorOffset:4')
    expect(events).toContain('setPastedContents:1')
    expect(events).toContain('setStashedPrompt:true')
  })
})
