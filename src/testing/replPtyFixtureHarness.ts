import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  spawnPtyContractSession,
  type PtyContractSession,
} from './ptyContractHarness.js'
import { rowsContainSubstring } from './replScreenContractHarness.js'

const TEST_CODE_DIR = process.cwd()
const TEST_TMPDIR = process.env.TMPDIR ?? tmpdir()

export type ReplPtyFixtureMessageSpec =
  | {
      readonly role: 'user'
      readonly content: string
    }
  | {
      readonly role: 'assistant'
      readonly content: string
    }
  | {
      readonly role: 'assistant'
      readonly toolUse: {
        readonly id: string
        readonly name: string
        readonly input: Record<string, unknown>
      }
    }
  | {
      readonly role: 'user'
      readonly toolResult: {
        readonly toolUseId: string
        readonly content: string
        readonly isError?: boolean
        readonly toolUseResult?: unknown
      }
    }

export type ReplPtyFixtureScenario = {
  readonly initialMessages?: readonly ReplPtyFixtureMessageSpec[]
}

export type ReplPtyFixture = {
  readonly tmpDir: string
  readonly readyPath: string
  readonly frameLogPath: string
  readonly rawOutputPath: string
  readonly scenarioPath?: string
  readonly session: PtyContractSession
  cleanup: () => void
}

function buildFixtureArgs(paths: {
  readyPath: string
  frameLogPath: string
  rawOutputPath: string
  scenarioPath?: string
}): string[] {
  const args = [
    process.execPath,
    'src/testing/replTmuxFixture.tsx',
    paths.readyPath,
    paths.frameLogPath,
    paths.rawOutputPath,
  ]
  if (paths.scenarioPath) {
    args.push(paths.scenarioPath)
  }
  return args
}

export function spawnReplPtyFixture(options?: {
  readonly prefix?: string
  readonly columns?: number
  readonly lines?: number
  readonly scenario?: ReplPtyFixtureScenario
}): ReplPtyFixture {
  const tmpDir = mkdtempSync(
    join(tmpdir(), options?.prefix ?? 'code-repl-pty-fixture-'),
  )
  const readyPath = join(tmpDir, 'ready')
  const frameLogPath = join(tmpDir, 'frames.jsonl')
  const rawOutputPath = join(tmpDir, 'raw-output.log')
  const scenarioPath = options?.scenario
    ? join(tmpDir, 'scenario.json')
    : undefined

  if (scenarioPath) {
    writeFileSync(
      scenarioPath,
      JSON.stringify(options.scenario, null, 2),
      'utf8',
    )
  }

  const session = spawnPtyContractSession(
    buildFixtureArgs({
      readyPath,
      frameLogPath,
      rawOutputPath,
      scenarioPath,
    }),
    {
      cwd: TEST_CODE_DIR,
      env: {
        TMPDIR: TEST_TMPDIR,
      },
      columns: options?.columns ?? 120,
      lines: options?.lines ?? 40,
    },
  )

  return {
    tmpDir,
    readyPath,
    frameLogPath,
    rawOutputPath,
    scenarioPath,
    session,
    cleanup() {
      rmSync(tmpDir, { recursive: true, force: true })
    },
  }
}

export async function waitForReplPtyPrompt(
  session: PtyContractSession,
  timeoutMs = 8000,
): Promise<string> {
  return await session.waitForVisibleText(
    text => rowsContainSubstring(text.split('\n'), '❯'),
    timeoutMs,
    'real PTY startup prompt',
  )
}
