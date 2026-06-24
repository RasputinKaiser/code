import { afterEach, describe, expect, it } from 'bun:test'
import { getIsInteractive, setIsInteractive } from '../bootstrap/state.js'
import {
  _resetForTesting,
  _resetTmuxControlModeProbeForTesting,
  isFullscreenEnvEnabled,
  maybeGetTmuxMouseHint,
} from './fullscreen.js'
import {
  createIsolatedTmuxSession,
  destroyIsolatedTmuxSession,
  getSessionTmuxEnv,
  isTmuxAvailableForTests,
  setGlobalOption,
  type IsolatedTmuxSession,
} from '../testing/tmuxHarness.js'

const tmuxIt = isTmuxAvailableForTests() ? it : it.skip
const liveSessions: IsolatedTmuxSession[] = []

afterEach(() => {
  while (liveSessions.length > 0) {
    destroyIsolatedTmuxSession(liveSessions.pop()!)
  }
  _resetForTesting()
  _resetTmuxControlModeProbeForTesting()
})

async function withEnv<T>(
  patch: Record<string, string | undefined>,
  fn: () => Promise<T> | T,
): Promise<T> {
  const previous = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(patch)) {
    previous.set(key, process.env[key])
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  try {
    return await fn()
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

async function withInteractive<T>(fn: () => Promise<T> | T): Promise<T> {
  const previous = getIsInteractive()
  setIsInteractive(true)
  try {
    return await fn()
  } finally {
    setIsInteractive(previous)
  }
}

describe('fullscreen tmux policy', () => {
  it('auto-disables fullscreen in tmux control-mode heuristic environments', async () => {
    await withEnv(
      {
        TMUX: '/tmp/tmux-test/default,1,0',
        TERM_PROGRAM: 'iTerm.app',
        TERM: 'xterm-256color',
        USER_TYPE: 'ant',
        NCODE_NO_FLICKER: undefined,
        CLAUDE_CODE_NO_FLICKER: undefined,
      },
      () => {
        _resetTmuxControlModeProbeForTesting()
        expect(isFullscreenEnvEnabled()).toBe(false)
      },
    )
  })

  it('lets explicit no-flicker opt-in override tmux control-mode auto-disable', async () => {
    await withEnv(
      {
        TMUX: '/tmp/tmux-test/default,1,0',
        TERM_PROGRAM: 'iTerm.app',
        TERM: 'xterm-256color',
        USER_TYPE: 'ant',
        NCODE_NO_FLICKER: '1',
        CLAUDE_CODE_NO_FLICKER: undefined,
      },
      () => {
        _resetTmuxControlModeProbeForTesting()
        expect(isFullscreenEnvEnabled()).toBe(true)
      },
    )
  })

  tmuxIt('surfaces the tmux mouse-off hint once per session when fullscreen is active', async () => {
    const session = createIsolatedTmuxSession({
      command: `bash -lc 'sleep 5'`,
    })
    liveSessions.push(session)
    setGlobalOption(session, 'mouse', 'off')

    await withEnv(
      {
        TMUX: getSessionTmuxEnv(session),
        TERM: 'screen-256color',
        TERM_PROGRAM: undefined,
        USER_TYPE: 'ant',
        NCODE_NO_FLICKER: undefined,
        CLAUDE_CODE_NO_FLICKER: undefined,
      },
      async () =>
        withInteractive(async () => {
          const first = await maybeGetTmuxMouseHint()
          const second = await maybeGetTmuxMouseHint()

          expect(first).toContain('tmux detected')
          expect(first).toContain('set -g mouse on')
          expect(second).toBeNull()
        }),
    )
  })

  tmuxIt('suppresses the tmux mouse hint when mouse is already enabled', async () => {
    const session = createIsolatedTmuxSession({
      command: `bash -lc 'sleep 5'`,
    })
    liveSessions.push(session)
    setGlobalOption(session, 'mouse', 'on')

    await withEnv(
      {
        TMUX: getSessionTmuxEnv(session),
        TERM: 'screen-256color',
        TERM_PROGRAM: undefined,
        USER_TYPE: 'ant',
        NCODE_NO_FLICKER: undefined,
        CLAUDE_CODE_NO_FLICKER: undefined,
      },
      async () =>
        withInteractive(async () => {
          expect(await maybeGetTmuxMouseHint()).toBeNull()
        }),
    )
  })
})
