import { afterEach, describe, expect, it } from 'bun:test'
import {
  captureAttachedTmuxTrace,
  createIsolatedTmuxSession,
  destroyIsolatedTmuxSession,
  isTmuxAvailableForTests,
  type IsolatedTmuxSession,
  type TmuxTraceFrame,
} from './tmuxHarness.js'
import {
  getFrameByLabel,
  hasVisibleTextContent,
} from './replContractHarness.js'
import {
  expectRowsNotToContainSubstring,
  expectRowsToContainSubstring,
  expectRowsToContainSubstringsInDistinctOrder,
  readVisibleRows,
} from './replScreenContractHarness.js'

const tmuxIt = isTmuxAvailableForTests() ? it : it.skip
const liveSessions: IsolatedTmuxSession[] = []

afterEach(() => {
  while (liveSessions.length > 0) {
    destroyIsolatedTmuxSession(liveSessions.pop()!)
  }
})

function buildDeterministicReplLoop(): string {
  return (
    "bash -lc '" +
    'printf "READY\\nrepl> "; ' +
    'while IFS= read -r line; do ' +
    'printf "\\nECHO:%s\\nrepl> " "$line"; ' +
    'done' +
    "'"
  )
}

describe('tmux attached repl trace lane', () => {
  tmuxIt('captures deterministic pane frames while typing through an attached client', async () => {
    const session = createIsolatedTmuxSession({
      command: buildDeterministicReplLoop(),
      width: 80,
      height: 16,
    })
    liveSessions.push(session)

    const frames = await captureAttachedTmuxTrace(
      session,
      [
        { label: 'typed-hello', input: 'hello', settleMs: 120 },
        { label: 'submitted-hello', input: '\r', settleMs: 140 },
        { label: 'typed-world', input: 'world', settleMs: 120 },
        { label: 'submitted-world', input: '\r', settleMs: 140 },
      ],
      {
        initialDelayMs: 200,
        paneCapture: { startLine: -40 },
      },
    )

    const initial = getFrameByLabel(frames, 'initial')
    const typedHello = getFrameByLabel(frames, 'typed-hello')
    const submittedHello = getFrameByLabel(frames, 'submitted-hello')
    const typedWorld = getFrameByLabel(frames, 'typed-world')
    const submittedWorld = getFrameByLabel(frames, 'submitted-world')

    const initialRows = readVisibleRows(initial.pane)
    const typedHelloRows = readVisibleRows(typedHello.pane)
    const submittedHelloRows = readVisibleRows(submittedHello.pane)
    const typedWorldRows = readVisibleRows(typedWorld.pane)
    const submittedWorldRows = readVisibleRows(submittedWorld.pane)

    expectRowsToContainSubstringsInDistinctOrder(
      initialRows,
      ['READY', 'repl>'],
      'initial tmux pane rows',
    )
    expectRowsToContainSubstring(
      typedHelloRows,
      'repl> hello',
      'typed hello tmux pane rows',
    )
    expectRowsNotToContainSubstring(
      typedHelloRows,
      'ECHO:hello',
      'typed hello tmux pane rows before submit',
    )
    expectRowsToContainSubstringsInDistinctOrder(
      submittedHelloRows,
      ['ECHO:hello', 'repl>'],
      'submitted hello tmux pane rows',
    )
    expectRowsToContainSubstringsInDistinctOrder(
      typedWorldRows,
      ['ECHO:hello', 'repl> world'],
      'typed world tmux pane rows',
    )
    expectRowsNotToContainSubstring(
      typedWorldRows,
      'ECHO:world',
      'typed world tmux pane rows before submit',
    )
    expectRowsToContainSubstringsInDistinctOrder(
      submittedWorldRows,
      ['ECHO:hello', 'ECHO:world', 'repl>'],
      'submitted world tmux pane rows',
    )

    expect(typedHello.cursorX).toBeGreaterThan(initial.cursorX)
    expect(typedWorld.cursorX).toBeGreaterThan(submittedHello.cursorX)

    for (const frame of frames) {
      expect(hasVisibleTextContent(frame.pane)).toBe(true)
    }
    for (let index = 1; index < frames.length; index += 1) {
      expect(frames[index]!.historySize).toBeGreaterThanOrEqual(
        frames[index - 1]!.historySize,
      )
    }
  })
})
