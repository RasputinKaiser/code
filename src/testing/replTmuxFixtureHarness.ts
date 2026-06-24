import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { shellQuote, createIsolatedTmuxSession, destroyIsolatedTmuxSession, capturePane, type IsolatedTmuxSession } from './tmuxHarness.js'
import { rowsContainSubstring } from './replScreenContractHarness.js'
import type { ReplPtyFixtureScenario } from './replPtyFixtureHarness.js'
import { waitForText } from './replContractHarness.js'

const TEST_CODE_DIR = process.cwd()
const TEST_TMPDIR = process.env.TMPDIR ?? tmpdir()

export type ReplTmuxFixture = {
  readonly tmpDir: string
  readonly readyPath: string
  readonly frameLogPath: string
  readonly rawOutputPath: string
  readonly scenarioPath?: string
  readonly session: IsolatedTmuxSession
  cleanup: () => void
}

export function buildReplTmuxFixtureCommand(paths: {
  readyPath: string
  frameLogPath: string
  rawOutputPath: string
  scenarioPath?: string
}): string {
  return (
    `bash -lc 'cd ${shellQuote(TEST_CODE_DIR)} && ` +
    `TMPDIR=${shellQuote(TEST_TMPDIR)} ` +
    `${shellQuote('/home/xjdr/.bun/bin/bun')} src/testing/replTmuxFixture.tsx ` +
    `${shellQuote(paths.readyPath)} ` +
    `${shellQuote(paths.frameLogPath)} ` +
    `${shellQuote(paths.rawOutputPath)}` +
    (paths.scenarioPath ? ` ${shellQuote(paths.scenarioPath)}` : '') +
    `'`
  )
}

export function spawnReplTmuxFixture(options?: {
  readonly prefix?: string
  readonly columns?: number
  readonly lines?: number
  readonly scenario?: ReplPtyFixtureScenario
}): ReplTmuxFixture {
  const tmpDir = mkdtempSync(
    join(tmpdir(), options?.prefix ?? 'code-repl-tmux-fixture-'),
  )
  const readyPath = join(tmpDir, 'ready')
  const frameLogPath = join(tmpDir, 'frames.jsonl')
  const rawOutputPath = join(tmpDir, 'raw-output.log')
  const scenarioPath = options?.scenario
    ? join(tmpDir, 'scenario.json')
    : undefined

  mkdirSync(tmpDir, { recursive: true })
  if (scenarioPath) {
    writeFileSync(
      scenarioPath,
      JSON.stringify(options.scenario, null, 2),
      'utf8',
    )
  }

  const session = createIsolatedTmuxSession({
    command: buildReplTmuxFixtureCommand({
      readyPath,
      frameLogPath,
      rawOutputPath,
      scenarioPath,
    }),
    width: options?.columns ?? 120,
    height: options?.lines ?? 40,
  })

  return {
    tmpDir,
    readyPath,
    frameLogPath,
    rawOutputPath,
    scenarioPath,
    session,
    cleanup() {
      destroyIsolatedTmuxSession(session)
      rmSync(tmpDir, { recursive: true, force: true })
    },
  }
}

export async function waitForReplTmuxPrompt(
  fixture: ReplTmuxFixture,
  timeoutMs = 8000,
): Promise<string> {
  return await waitForText(
    () => capturePane(fixture.session, { startLine: -120 }),
    pane => rowsContainSubstring(pane.split('\n'), '❯'),
    { timeoutMs, label: 'real tmux REPL startup prompt' },
  )
}
