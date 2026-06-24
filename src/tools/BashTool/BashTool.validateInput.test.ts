import { describe, expect, it } from 'bun:test'
import { getDefaultAppState } from '../../state/AppStateStore.js'
import { BashTool } from './BashTool.js'

function createToolUseContext(toolNames: string[]) {
  let appState = getDefaultAppState()

  const setAppState = (updater: (prev: typeof appState) => typeof appState) => {
    appState = updater(appState)
  }

  return {
    options: {
      commands: [],
      debug: false,
      mainLoopModel: '/data/models/hf/moonshotai__Kimi-K2.7-Code',
      tools: toolNames.map(name => ({ name })) as never,
      verbose: false,
      thinkingConfig: {} as never,
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: true,
      agentDefinitions: {
        activeAgents: [],
        allAgents: [],
      },
    },
    abortController: new AbortController(),
    readFileState: {} as never,
    getAppState: () => appState,
    setAppState,
    setAppStateForTasks: setAppState,
    setInProgressToolUseIDs: () => {},
    setResponseLength: () => {},
    updateFileHistoryState: () => {},
  } as never
}

describe('BashTool.validateInput repo discovery and counting commands', () => {
  it('allows find-based repository discovery when direct tools are also available', async () => {
    const result = await BashTool.validateInput!(
      {
        command: 'find /mlstore/src/noumena/ncode/code -type f | wc -l',
      },
      createToolUseContext(['Bash', 'Glob', 'Read', 'Grep']),
    )

    expect(result).toEqual({ result: true })
  })

  it('allows ls-based repository discovery when direct tools are also available', async () => {
    const result = await BashTool.validateInput!(
      {
        command: 'ls -la /mlstore/src/noumena/ncode/code',
      },
      createToolUseContext(['Bash', 'Glob', 'Read', 'Grep']),
    )

    expect(result).toEqual({ result: true })
  })

  it('allows rg-based repository search when direct tools are also available', async () => {
    const result = await BashTool.validateInput!(
      {
        command:
          "rg -n -S 'TODO|FIXME|HACK|XXX' /mlstore/src/noumena/ncode/code/src --glob '*.{ts,tsx}' | head -60",
      },
      createToolUseContext(['Bash', 'Glob', 'Read', 'Grep']),
    )

    expect(result).toEqual({ result: true })
  })

  it('allows grep-based compatibility search when direct tools are also available', async () => {
    const result = await BashTool.validateInput!(
      {
        command:
          "grep -r -n -E 'TODO|FIXME|HACK|XXX' /mlstore/src/noumena/ncode/code/src/ --include='*.ts' --include='*.tsx' | head -60",
      },
      createToolUseContext(['Bash', 'Glob', 'Read', 'Grep']),
    )

    expect(result).toEqual({ result: true })
  })

  it('allows broad wc-based repository counting when direct tools are also available', async () => {
    const result = await BashTool.validateInput!(
      {
        command:
          'wc -l /mlstore/src/noumena/ncode/code/src/main.tsx /mlstore/src/noumena/ncode/code/src/cli/print.ts /mlstore/src/noumena/ncode/code/src/QueryEngine.ts',
      },
      createToolUseContext(['Bash', 'Glob', 'Read', 'Grep']),
    )

    expect(result).toEqual({ result: true })
  })

  it('allows find piped into wc-based repository counting when direct tools are also available', async () => {
    const result = await BashTool.validateInput!(
      {
        command:
          "find /mlstore/src/noumena/ncode/code/src -type f \\( -name '*.ts' -o -name '*.tsx' \\) | wc -l",
      },
      createToolUseContext(['Bash', 'Glob', 'Read', 'Grep']),
    )

    expect(result).toEqual({ result: true })
  })

  it('allows single-file wc when dedicated tools are available', async () => {
    const result = await BashTool.validateInput!(
      {
        command: 'wc -l /mlstore/src/noumena/ncode/code/dist/cli.js',
      },
      createToolUseContext(['Bash', 'Glob', 'Read', 'Grep']),
    )

    expect(result).toEqual({ result: true })
  })

  it('allows sl status when scm inspection is genuinely needed', async () => {
    const result = await BashTool.validateInput!(
      {
        command: 'sl status',
      },
      createToolUseContext(['Bash', 'Glob', 'Read', 'Grep']),
    )

    expect(result).toEqual({ result: true })
  })

  it('allows sl root when direct tools are also available', async () => {
    const result = await BashTool.validateInput!(
      {
        command: 'sl root',
      },
      createToolUseContext(['Bash', 'Glob', 'Read', 'Grep']),
    )

    expect(result).toEqual({ result: true })
  })

  it('allows git status for git-only workflows', async () => {
    const result = await BashTool.validateInput!(
      {
        command: 'git status --short',
      },
      createToolUseContext(['Bash', 'Glob', 'Read', 'Grep']),
    )

    expect(result).toEqual({ result: true })
  })

  it('allows git rev-parse --show-toplevel when direct tools are also available', async () => {
    const result = await BashTool.validateInput!(
      {
        command: 'git rev-parse --show-toplevel',
      },
      createToolUseContext(['Bash', 'Glob', 'Read', 'Grep']),
    )

    expect(result).toEqual({ result: true })
  })

  it('still allows find when dedicated discovery tools are unavailable', async () => {
    const result = await BashTool.validateInput!(
      {
        command: 'find /mlstore/src/noumena/ncode/code -type f | wc -l',
      },
      createToolUseContext(['Bash']),
    )

    expect(result).toEqual({ result: true })
  })
})
