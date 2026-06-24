import { describe, expect, it } from 'bun:test'
import type { Diff } from './frame.js'
import type { Terminal } from './terminal.js'
import { writeDiffToTerminal } from './terminal.js'
import { BSU, ESU } from './termio/dec.js'

function withEnv<T>(
  updates: Partial<Record<'TMUX' | 'TERM_PROGRAM' | 'TERM', string | undefined>>,
  fn: () => T,
): T {
  const previous = {
    TMUX: process.env.TMUX,
    TERM_PROGRAM: process.env.TERM_PROGRAM,
    TERM: process.env.TERM,
  }

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  try {
    return fn()
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

function serializeDiff(diff: Diff, skipSyncMarkers = false): string {
  let written = ''
  const terminal = {
    stdout: {
      write(chunk: string) {
        written += chunk
        return true
      },
    },
    stderr: {
      write() {
        return true
      },
    },
  } as unknown as Terminal

  writeDiffToTerminal(terminal, diff, skipSyncMarkers)
  return written
}

describe('writeDiffToTerminal synchronized output policy', () => {
  it('suppresses DEC 2026 wrappers in tmux on the default main-screen path', () => {
    const output = withEnv(
      {
        TMUX: '/tmp/tmux-test/default,1,0',
        TERM_PROGRAM: 'WezTerm',
        TERM: 'screen-256color',
      },
      () => serializeDiff([{ type: 'stdout', content: 'ABC' }]),
    )

    expect(output).toBe('ABC')
    expect(output.includes(BSU)).toBe(false)
    expect(output.includes(ESU)).toBe(false)
  })

  it('still wraps output on supported terminals outside tmux', () => {
    const output = withEnv(
      {
        TMUX: undefined,
        TERM_PROGRAM: 'WezTerm',
        TERM: 'wezterm',
      },
      () => serializeDiff([{ type: 'stdout', content: 'ABC' }]),
    )

    expect(output).toBe(`${BSU}ABC${ESU}`)
  })
})
