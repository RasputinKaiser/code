import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { getEmptyToolPermissionContext } from '../../Tool.js'
import { BashTool } from '../../tools/BashTool/BashTool.js'
import { ShellError } from '../errors.js'
import { processBashCommand } from './processBashCommand.js'

type BashCall = typeof BashTool.call

let originalBashCall: BashCall

function createContext() {
  return {
    abortController: new AbortController(),
    readFileState: {} as never,
    getAppState: () => ({
      toolPermissionContext: getEmptyToolPermissionContext(),
    }),
    setAppState: () => {},
    options: {
      verbose: false,
    },
    setMessages: () => {},
    onChangeAPIKey: () => {},
  } as never
}

beforeEach(() => {
  originalBashCall = BashTool.call
})

afterEach(() => {
  ;(BashTool as { call: BashCall }).call = originalBashCall
})

describe('processBashCommand', () => {
  it('wraps successful command output in bash stdout/stderr messages and preserves preceding text blocks', async () => {
    ;(BashTool as { call: BashCall }).call = (async () => ({
      data: {
        stdout: 'hello',
        stderr: 'warn & note',
        interrupted: false,
        isImage: false,
        noOutputExpected: false,
      },
    })) as BashCall

    const toolJSXCalls: unknown[] = []
    const result = await processBashCommand(
      'printf hello',
      [
        {
          type: 'text',
          text: 'before',
        },
      ],
      [],
      createContext(),
      args => {
        toolJSXCalls.push(args)
      },
    )

    expect(result.messages).toHaveLength(3)
    expect(result.messages[0]).toMatchObject({
      type: 'user',
      isMeta: true,
      message: {
        role: 'user',
        content: expect.stringContaining('<local-command-caveat>'),
      },
    })
    expect(result.messages[1]).toMatchObject({
      type: 'user',
      message: {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'before',
          },
          {
            type: 'text',
            text: '<bash-input>printf hello</bash-input>',
          },
        ],
      },
    })
    expect(result.messages[2]).toMatchObject({
      type: 'user',
      message: {
        role: 'user',
        content: expect.stringMatching(
          /^<bash-stdout>hello<\/bash-stdout><bash-stderr>warn &amp; note<\/bash-stderr>$/,
        ),
      },
    })
    expect(toolJSXCalls[0]).toMatchObject({
      shouldHidePromptInput: false,
    })
    expect(toolJSXCalls.at(-1)).toBeNull()
  })

  it('surfaces command failures as bash stdout/stderr instead of collapsing them into a generic error', async () => {
    ;(BashTool as { call: BashCall }).call = (async () => {
      throw new ShellError('partial output', 'exit <1>', 1, false)
    }) as BashCall

    const result = await processBashCommand(
      'false',
      [],
      [],
      createContext(),
      () => {},
    )

    expect(result.messages).toHaveLength(3)
    expect(result.messages[0]).toMatchObject({
      type: 'user',
      isMeta: true,
      message: {
        role: 'user',
        content: expect.stringContaining('<local-command-caveat>'),
      },
    })
    expect(result.messages[1]).toMatchObject({
      type: 'user',
      message: {
        role: 'user',
        content: '<bash-input>false</bash-input>',
      },
    })
    expect(result.messages[2]).toMatchObject({
      type: 'user',
      message: {
        role: 'user',
        content: expect.stringMatching(
          /^<bash-stdout>partial output<\/bash-stdout><bash-stderr>exit &lt;1&gt;<\/bash-stderr>$/,
        ),
      },
    })
  })

  it('turns interrupted shell failures into a user interruption message', async () => {
    ;(BashTool as { call: BashCall }).call = (async () => {
      throw new ShellError('', 'stopped', 130, true)
    }) as BashCall

    const result = await processBashCommand(
      'sleep 10',
      [],
      [],
      createContext(),
      () => {},
    )

    expect(result.messages).toHaveLength(3)
    expect(result.messages[0]).toMatchObject({
      type: 'user',
      isMeta: true,
      message: expect.objectContaining({
        role: 'user',
        content: expect.stringContaining('<local-command-caveat>'),
      }),
    })
    expect(result.messages[1]).toMatchObject({
      type: 'user',
      message: expect.objectContaining({
        role: 'user',
        content: '<bash-input>sleep 10</bash-input>',
      }),
    })
    expect(result.messages[2]).toMatchObject({
      type: 'user',
      message: expect.objectContaining({
        role: 'user',
        content: [
          {
            type: 'text',
            text: '[Request interrupted by user]',
          },
        ],
      }),
    })
  })
})
