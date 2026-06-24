import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  cleanupMountedRepl,
  mountRepl,
  normalizeTerminalText,
  waitFor,
  writeInput,
} from './replPerfHarness.js'
import { diffRenderTrace, installRenderTrace } from '../utils/renderTrace.js'

const ORIGINAL_NO_FLICKER = process.env.CLAUDE_CODE_NO_FLICKER
const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY
const ORIGINAL_LIVE_TRACE_FILE = process.env.NCODE_LIVE_TRACE_FILE

beforeEach(() => {
  process.env.CLAUDE_CODE_NO_FLICKER = '1'
  process.env.ANTHROPIC_API_KEY = 'test-key'
})

afterEach(async () => {
  mock.restore()
  await cleanupMountedRepl()

  if (ORIGINAL_LIVE_TRACE_FILE === undefined) {
    delete process.env.NCODE_LIVE_TRACE_FILE
  } else {
    process.env.NCODE_LIVE_TRACE_FILE = ORIGINAL_LIVE_TRACE_FILE
  }
})

describe('mounted REPL typing trace after assistant reply', () => {
  test('captures first-keypress invalidation after a completed assistant turn', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'ncode-input-trace-'))
    const tracePath = join(tmpDir, 'live-trace.jsonl')
    writeFileSync(tracePath, '', 'utf8')
    process.env.NCODE_LIVE_TRACE_FILE = tracePath

    const renderTrace = installRenderTrace()

    const queryPaths = [
      import.meta.resolve('../query.ts'),
      import.meta.resolve('../query.js'),
    ]
    const { createAssistantMessage } = await import('../utils/messages.js')
    const actualQueryModule = await import(import.meta.resolve('../query.ts'))
    for (const path of queryPaths) {
      mock.module(path, () => ({
        ...actualQueryModule,
        query: async function* () {
          yield createAssistantMessage({
            content: [
              'reply heading',
              '',
              '- bullet one',
              '- bullet two',
              '',
              '| A | B |',
              '|---|---|',
              '| 1 | 2 |',
            ].join('\n'),
          })
          return { reason: 'completed' } as never
        },
      }))
    }

    try {
      const { terminal, frames } = await mountRepl({
        messageCount: 30,
        terminalRows: 40,
        terminalColumns: 100,
      })

      await writeInput(terminal.stdin, 'trigger reply')
      await Bun.sleep(40)
      await writeInput(terminal.stdin, '\r')

      await waitFor(
        () => normalizeTerminalText(terminal.getOutput()).includes('reply heading'),
        'mounted REPL never rendered the assistant reply',
        4000,
      )

      await Bun.sleep(80)
      writeFileSync(tracePath, '', 'utf8')
      renderTrace.reset()
      const before = renderTrace.snapshot()
      const frameStart = frames.length

      await writeInput(terminal.stdin, 'x')

      await waitFor(
        () => {
          const content = readFileSync(tracePath, 'utf8')
          return content.includes('"kind":"prompt-draft-set"')
        },
        'first typed char never reached prompt-draft controller',
        1000,
      )

      await Bun.sleep(100)

      const after = renderTrace.snapshot()
      const diff = diffRenderTrace(before, after)
      const traceLines = readFileSync(tracePath, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line) as Record<string, unknown>)
      const postKeyFrames = frames.slice(frameStart)
      const terminalWrites = traceLines.filter(
        event => event.kind === 'terminal-write',
      )
      const promptDraftEvents = traceLines.filter(
        event => event.kind === 'prompt-draft-set',
      )

      console.log(
        JSON.stringify(
          {
            renderDiff: diff,
            terminalWrites,
            promptDraftEvents,
            frameCount: postKeyFrames.length,
            frameBytes: postKeyFrames.map(frame => frame.phases?.bytes ?? 0),
            frameYogaVisited: postKeyFrames.map(
              frame => frame.phases?.yogaVisited ?? 0,
            ),
          },
          null,
          2,
        ),
      )

      expect(promptDraftEvents.length).toBeGreaterThan(0)
    } finally {
      renderTrace.uninstall()
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
