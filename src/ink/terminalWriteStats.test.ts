import { describe, expect, it } from 'bun:test'
import type { Diff } from './frame.js'
import type { Terminal } from './terminal.js'
import { writeDiffToTerminal } from './terminal.js'
import {
  getTerminalWriteStatsSnapshot,
  resetTerminalWriteStatsForTesting,
} from './terminalWriteStats.js'

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

describe('terminal write stats telemetry', () => {
  it('records patch mix, serialized bytes, and sync usage without changing output', () => {
    resetTerminalWriteStatsForTesting()
    const output = serializeDiff(
      [
        { type: 'stdout', content: 'hello' },
        { type: 'cursorMove', x: 1, y: -2 },
        { type: 'clear', count: 2 },
      ],
      true,
    )

    expect(output).toContain('hello')

    const snapshot = getTerminalWriteStatsSnapshot()
    expect(snapshot.writeCalls).toBe(1)
    expect(snapshot.totalInputPatches).toBe(3)
    expect(snapshot.maxInputPatchCount).toBe(3)
    expect(snapshot.patchTypeCounts.stdout).toBe(1)
    expect(snapshot.patchTypeCounts.cursorMove).toBe(1)
    expect(snapshot.patchTypeCounts.clear).toBe(1)
    expect(snapshot.syncWrappedCalls).toBe(0)
    expect(snapshot.lastUseSync).toBe(false)
    expect(snapshot.lastSerializedBytes).toBe(Buffer.byteLength(output))
    expect(snapshot.totalSerializedBytes).toBe(Buffer.byteLength(output))
    expect(snapshot.lastStdoutPatchCount).toBe(1)
    expect(snapshot.lastStdoutPatchBytes).toBe(Buffer.byteLength('hello'))
    expect(snapshot.totalStdoutPatchBytes).toBe(Buffer.byteLength('hello'))
    expect(snapshot.maxStdoutPatchBytes).toBe(Buffer.byteLength('hello'))
    expect(snapshot.lastSerializeDurationMs).toBeGreaterThanOrEqual(0)
    expect(snapshot.maxSerializeDurationMs).toBeGreaterThanOrEqual(0)
  })

  it('increments sync-wrapped call count when sync wrappers are active', () => {
    resetTerminalWriteStatsForTesting()
    const prevTmux = process.env.TMUX
    const prevTermProgram = process.env.TERM_PROGRAM
    const prevTerm = process.env.TERM
    delete process.env.TMUX
    process.env.TERM_PROGRAM = 'WezTerm'
    process.env.TERM = 'wezterm'
    try {
      serializeDiff([{ type: 'stdout', content: 'x' }], false)
    } finally {
      if (prevTmux === undefined) {
        delete process.env.TMUX
      } else {
        process.env.TMUX = prevTmux
      }
      if (prevTermProgram === undefined) {
        delete process.env.TERM_PROGRAM
      } else {
        process.env.TERM_PROGRAM = prevTermProgram
      }
      if (prevTerm === undefined) {
        delete process.env.TERM
      } else {
        process.env.TERM = prevTerm
      }
    }

    const snapshot = getTerminalWriteStatsSnapshot()
    expect(snapshot.writeCalls).toBe(1)
    expect(snapshot.syncWrappedCalls).toBe(1)
    expect(snapshot.lastUseSync).toBe(true)
  })
})
