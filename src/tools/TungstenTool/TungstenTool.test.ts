import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { spawnSync } from 'child_process'
import { TungstenTool } from './TungstenTool.js'

const originalBuildMode = process.env.NCODE_BUILD_MODE
const originalUserType = process.env.USER_TYPE
const tmuxAvailable =
  spawnSync('tmux', ['-V'], { encoding: 'utf-8' }).status === 0
const tmuxIt = tmuxAvailable ? it : it.skip

function makeCtx(
  onSetAppState?: (s: Record<string, unknown>) => void,
): Record<string, unknown> {
  return {
    setAppState(fn: (p: Record<string, unknown>) => Record<string, unknown>) {
      const result = fn({})
      onSetAppState?.(result)
    },
  }
}

beforeEach(() => {})

afterEach(() => {
  if (originalBuildMode === undefined) {
    delete process.env.NCODE_BUILD_MODE
  } else {
    process.env.NCODE_BUILD_MODE = originalBuildMode
  }
  if (originalUserType === undefined) {
    delete process.env.USER_TYPE
  } else {
    process.env.USER_TYPE = originalUserType
  }
  spawnSync('tmux', ['-L', `ncode-${process.pid}`, 'kill-server'], {
    encoding: 'utf-8',
  })
})

describe('TungstenTool runtime contract', () => {
  it('is only enabled on noumena builds', () => {
    delete process.env.NCODE_BUILD_MODE
    delete process.env.USER_TYPE
    expect(TungstenTool.isEnabled!()).toBe(false)

    process.env.NCODE_BUILD_MODE = 'noumena'
    expect(TungstenTool.isEnabled!()).toBe(true)

    delete process.env.NCODE_BUILD_MODE
    process.env.USER_TYPE = 'noumena'
    expect(TungstenTool.isEnabled!()).toBe(true)

    process.env.USER_TYPE = 'ant'
    expect(TungstenTool.isEnabled!()).toBe(false)
  })

  it('defines input and output schemas', () => {
    expect(TungstenTool.inputSchema).toBeDefined()
    expect(TungstenTool.outputSchema).toBeDefined()
  })

  it('maps results into a model-visible text block', () => {
    const block = TungstenTool.mapToolResultToToolResultBlockParam!(
      {
        tmux_exit_code: 0,
        target: 'demo:0.0',
        session_id: '$0',
        window_id: '@0',
        pane_id: '%0',
        capture_mode: 'since_marker',
        marker_found: true,
        pane_output: 'hello from pane',
        summary: 'ran command on demo',
      },
      'toolu_tungsten',
    )

    expect(block).toEqual({
      type: 'tool_result',
      tool_use_id: 'toolu_tungsten',
      content: [
        'Target: demo:0.0',
        'Session ID: $0',
        'Window ID: @0',
        'Pane ID: %0',
        'tmux exit code: 0',
        'Capture mode: since_marker',
        'Marker found: true',
        'Summary: ran command on demo',
        'Pane output:',
        'hello from pane',
      ].join('\n'),
    })
  })
})

describe('TungstenTool e2e', () => {
  function ctx() {
    return makeCtx()
  }

  tmuxIt('creates a session and lists it', async () => {
    process.env.NCODE_BUILD_MODE = 'noumena'
    const sessionName = `tungsten-test-${process.pid}`

    try {
      const created = await TungstenTool.call(
        {
          action: 'create_session',
          name: sessionName,
        },
        ctx() as never,
        undefined as never,
        undefined as never,
      )
      expect(created.data.tmux_exit_code).toBe(0)
      expect(created.data.target).toBe(`${sessionName}:0.0`)
      expect(created.data.session_id).toStartWith('$')
      expect(created.data.window_id).toStartWith('@')
      expect(created.data.pane_id).toStartWith('%')

      const listed = await TungstenTool.call(
        { action: 'list_sessions' },
        ctx() as never,
        undefined as never,
        undefined as never,
      )
      expect(listed.data.tmux_exit_code).toBe(0)
      expect(listed.data.pane_output).toContain(sessionName)

      // list_windows and list_panes
      const windows = await TungstenTool.call(
        { action: 'list_windows', target: sessionName },
        ctx() as never,
        undefined as never,
        undefined as never,
      )
      expect(windows.data.tmux_exit_code).toBe(0)
      expect(windows.data.pane_output).toBeTruthy()

      const panes = await TungstenTool.call(
        { action: 'list_panes', target: sessionName },
        ctx() as never,
        undefined as never,
        undefined as never,
      )
      expect(panes.data.tmux_exit_code).toBe(0)
      expect(panes.data.pane_output).toBeTruthy()
    } finally {
      await TungstenTool.call(
        { action: 'kill_session', target: sessionName },
        ctx() as never,
        undefined as never,
        undefined as never,
      ).catch(() => undefined)
    }
  })

  tmuxIt('sends literal text and captures output', async () => {
    process.env.NCODE_BUILD_MODE = 'noumena'
    const sessionName = `tungsten-text-${process.pid}`

    try {
      await TungstenTool.call(
        { action: 'create_session', name: sessionName },
        ctx() as never,
        undefined as never,
        undefined as never,
      )

      await TungstenTool.call(
        {
          action: 'send_text',
          target: sessionName,
          text: 'printf TUNGSTEN_TEXT_OK',
        },
        ctx() as never,
        undefined as never,
        undefined as never,
      )
      await sleep(50)
      await TungstenTool.call(
        {
          action: 'send_keys',
          target: sessionName,
          keys: ['Enter'],
        },
        ctx() as never,
        undefined as never,
        undefined as never,
      )
      let cap
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await sleep(100)
        cap = await TungstenTool.call(
          {
            action: 'capture_pane',
            target: sessionName,
            mode: 'scrollback',
            lines: 20,
          },
          ctx() as never,
          undefined as never,
          undefined as never,
        )
        if (typeof cap.data.pane_output === 'string' &&
          cap.data.pane_output.includes('TUNGSTEN_TEXT_OK')) {
          break
        }
      }
      expect(cap?.data.pane_output).toContain('TUNGSTEN_TEXT_OK')
    } finally {
      await TungstenTool.call(
        { action: 'kill_session', target: sessionName },
        ctx() as never,
        undefined as never,
        undefined as never,
      ).catch(() => undefined)
    }
  })

  tmuxIt('run_command uses marker-based capture', async () => {
    process.env.NCODE_BUILD_MODE = 'noumena'
    const sessionName = `tungsten-run-${process.pid}`

    try {
      await TungstenTool.call(
        { action: 'create_session', name: sessionName },
        ctx() as never,
        undefined as never,
        undefined as never,
      )

      const result = await TungstenTool.call(
        {
          action: 'run_command',
          target: sessionName,
          command: 'printf TUNGSTEN_RUN_OK',
          wait_ms: 500,
          capture_lines: 30,
        },
        ctx() as never,
        undefined as never,
        undefined as never,
      )

      expect(result.data.tmux_exit_code).toBe(0)
      expect(result.data.marker_found).toBe(true)
      expect(result.data.marker).toBeTruthy()
      // The pane output should contain the command result but NOT the shell
      // prompt clutter that precedes the marker.
      expect(result.data.pane_output).toContain('TUNGSTEN_RUN_OK')
      expect(result.data.pane_output).not.toContain(result.data.marker!)

      const sinceMarker = await TungstenTool.call(
        {
          action: 'capture_pane',
          target: sessionName,
          mode: 'since_marker',
          lines: 40,
        },
        ctx() as never,
        undefined as never,
        undefined as never,
      )
      expect(sinceMarker.data.marker_found).toBe(true)
      expect(sinceMarker.data.pane_output).toContain('TUNGSTEN_RUN_OK')
      expect(sinceMarker.data.pane_output).not.toContain(result.data.marker!)
      expect(sinceMarker.data.pane_output).not.toContain('printf TUNGSTEN_RUN_OK')
    } finally {
      await TungstenTool.call(
        { action: 'kill_session', target: sessionName },
        ctx() as never,
        undefined as never,
        undefined as never,
      ).catch(() => undefined)
    }
  })

  tmuxIt('send_command backward-compat alias works', async () => {
    process.env.NCODE_BUILD_MODE = 'noumena'
    const sessionName = `tungsten-compat-${process.pid}`

    try {
      await TungstenTool.call(
        { action: 'create_session', name: sessionName },
        ctx() as never,
        undefined as never,
        undefined as never,
      )

      const result = await TungstenTool.call(
        {
          action: 'send_command',
          session_name: sessionName,
          command: 'printf TUNGSTEN_COMPAT_OK',
          wait_ms: 500,
          capture_lines: 30,
        },
        ctx() as never,
        undefined as never,
        undefined as never,
      )

      expect(result.data.tmux_exit_code).toBe(0)
      expect(result.data.pane_output).toContain('TUNGSTEN_COMPAT_OK')
      expect(result.data.summary).toContain('deprecated')
    } finally {
      await TungstenTool.call(
        { action: 'kill_session', target: sessionName },
        ctx() as never,
        undefined as never,
        undefined as never,
      ).catch(() => undefined)
    }
  })

  tmuxIt('kill_session clears app state for the active session', async () => {
    process.env.NCODE_BUILD_MODE = 'noumena'
    const sessionName = `tungsten-kill-${process.pid}`
    let lastState: Record<string, unknown> = {}

    try {
      await TungstenTool.call(
        { action: 'create_session', name: sessionName },
        makeCtx(s => {
          lastState = s
        }) as never,
        undefined as never,
        undefined as never,
      )

      expect(lastState.tungstenActiveSession).toBeDefined()

      await TungstenTool.call(
        { action: 'kill_session', target: sessionName },
        makeCtx(s => {
          lastState = s
        }) as never,
        undefined as never,
        undefined as never,
      )

      expect(lastState.tungstenActiveSession).toBeUndefined()
      expect(lastState.tungstenPanelVisible).toBeUndefined()
    } catch {
      // cleanup
      spawnSync('tmux', ['-L', `ncode-${process.pid}`, 'kill-server'], {
        encoding: 'utf-8',
      })
    }
  })
})

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
