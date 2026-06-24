import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { capturePane, createIsolatedTmuxSession, destroyIsolatedTmuxSession, sendKeys, shellQuote, type IsolatedTmuxSession } from './tmuxHarness.js'
import { waitForText } from './replContractHarness.js'
import { readVisibleRows, rowsContainSubstringsInDistinctOrder } from './replScreenContractHarness.js'
import {
  WRAPPER_HARNESS_REPO_ROOT,
  buildTrustedWrapperGlobalConfig,
  buildSteadyStateWrapperExpectedRows,
  buildWrapperOnboardingExpectedRows,
  createWrapperEnv,
  getWrapperHarnessBunBin,
  requireCompiledBinaryPath,
  resolveSelfContainedWrapperPath,
  resolveStagingWrapperPath,
} from './wrapperPtyHarness.js'
import { writeSmokeGlobalConfig } from '../../tools/smoke/oauthHarness.mjs'

export type WrapperTmuxFixture = {
  readonly tmpDir: string
  readonly configDir: string
  readonly session: IsolatedTmuxSession
  readonly cwd: string
  readonly startupTimeoutMs: number
  readonly startupBudgetMs: number
  readonly expectedRows: readonly string[]
  getElapsedMs: () => number
  cleanup: () => void
}

function writeEnvLaunchScript(
  scriptPath: string,
  wrapperPath: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
): void {
  const exportedVars = Object.entries(env)
    .filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `export ${key}=${shellQuote(String(value))}`)
    .join('\n')

  writeFileSync(
    scriptPath,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `cd ${shellQuote(cwd)}`,
      exportedVars,
      `exec ${shellQuote(wrapperPath)}`,
      '',
    ].join('\n'),
    'utf8',
  )
}

function createFixture(options: {
  readonly prefix: string
  readonly wrapperPath: string
  readonly envFactory: (
    configDir: string,
    tmpDir: string,
  ) => Promise<NodeJS.ProcessEnv>
  readonly expectedRows: readonly string[]
  readonly cwd?: string
  readonly height?: number
  readonly startupTimeoutMs?: number
  readonly startupBudgetMs?: number
}): Promise<WrapperTmuxFixture> {
  const tmpDir = mkdtempSync(join(tmpdir(), options.prefix))
  const configDir = join(tmpDir, 'config')
  const launchScriptPath = join(tmpDir, 'launch-wrapper.sh')
  mkdirSync(configDir, { recursive: true })
  return options.envFactory(configDir, tmpDir).then(env => {
    writeEnvLaunchScript(
      launchScriptPath,
      options.wrapperPath,
      options.cwd ?? WRAPPER_HARNESS_REPO_ROOT,
      env,
    )

    const startedAt = Date.now()
    const session = createIsolatedTmuxSession({
      command: `bash ${shellQuote(launchScriptPath)}`,
      width: 120,
      height: options.height ?? 40,
    })

    return {
      tmpDir,
      configDir,
      session,
      cwd: options.cwd ?? WRAPPER_HARNESS_REPO_ROOT,
      startupTimeoutMs: options.startupTimeoutMs ?? 25_000,
      startupBudgetMs: options.startupBudgetMs ?? 18_000,
      expectedRows: options.expectedRows,
      getElapsedMs() {
        return Date.now() - startedAt
      },
      cleanup() {
        destroyIsolatedTmuxSession(session)
        rmSync(tmpDir, { recursive: true, force: true })
      },
    }
  })
}

export async function waitForWrapperTmuxRows(
  fixture: WrapperTmuxFixture,
  label: string,
  timeoutMs = fixture.startupTimeoutMs,
): Promise<string> {
  return await waitForText(
    () => capturePane(fixture.session, { startLine: 0 }),
    pane =>
      rowsContainSubstringsInDistinctOrder(
        readVisibleRows(pane),
        fixture.expectedRows,
      ),
    { timeoutMs, label },
  )
}

export async function waitForWrapperTmuxTranscriptRows(
  fixture: WrapperTmuxFixture,
  label: string,
  timeoutMs = 8_000,
): Promise<string> {
  return await waitForText(
    () => capturePane(fixture.session, { startLine: 0 }),
    pane => {
      const rows = readVisibleRows(pane)
      return (
        rows.some(
          row =>
            row.includes('Showing detailed transcript') &&
            row.includes('ctrl+o to toggle'),
        ) && rows.some(row => row.includes(fixture.expectedRows[3]!))
      )
    },
    { timeoutMs, label },
  )
}

export async function spawnStagingWrapperTmuxPromptFixture(): Promise<WrapperTmuxFixture> {
  const compiledBinaryPath = requireCompiledBinaryPath()

  return await createFixture({
    prefix: 'code-wrapper-tmux-',
    wrapperPath: resolveStagingWrapperPath(),
    envFactory: async (configDir, tmpDir) => {
      const env = createWrapperEnv(configDir, {
        HOME: tmpDir,
        BUN_BIN: getWrapperHarnessBunBin(),
        NCODE_EXECUTABLE: compiledBinaryPath,
      })
      await writeSmokeGlobalConfig(
        configDir,
        env,
        buildTrustedWrapperGlobalConfig({
          theme: 'dark',
          hasCompletedOnboarding: true,
        }),
      )
      return env
    },
    expectedRows: buildSteadyStateWrapperExpectedRows(
      WRAPPER_HARNESS_REPO_ROOT,
    ),
    cwd: WRAPPER_HARNESS_REPO_ROOT,
    startupTimeoutMs: 20_000,
    startupBudgetMs: 15_000,
  })
}

export async function spawnSelfContainedWrapperTmuxPromptFixture(): Promise<WrapperTmuxFixture> {
  requireCompiledBinaryPath()

  return await createFixture({
    prefix: 'code-self-contained-tmux-',
    wrapperPath: resolveSelfContainedWrapperPath(),
    envFactory: async (configDir, tmpDir) => {
      const env = createWrapperEnv(configDir, {
        HOME: tmpDir,
        BUN_BIN: getWrapperHarnessBunBin(),
      })
      await writeSmokeGlobalConfig(
        configDir,
        env,
        buildTrustedWrapperGlobalConfig({
          theme: 'dark',
          hasCompletedOnboarding: true,
        }),
      )
      return env
    },
    expectedRows: buildSteadyStateWrapperExpectedRows(
      WRAPPER_HARNESS_REPO_ROOT,
    ),
    cwd: WRAPPER_HARNESS_REPO_ROOT,
    startupTimeoutMs: 25_000,
    startupBudgetMs: 18_000,
  })
}

export async function spawnSelfContainedWrapperTmuxOnboardingFixture(): Promise<WrapperTmuxFixture> {
  requireCompiledBinaryPath()

  return await createFixture({
    prefix: 'code-self-contained-onboarding-tmux-',
    wrapperPath: resolveSelfContainedWrapperPath(),
    envFactory: async (configDir, tmpDir) => {
      const env = createWrapperEnv(configDir, {
        HOME: tmpDir,
        BUN_BIN: getWrapperHarnessBunBin(),
      })
      await writeSmokeGlobalConfig(
        configDir,
        env,
        buildTrustedWrapperGlobalConfig(),
      )
      return env
    },
    expectedRows: buildWrapperOnboardingExpectedRows(),
    cwd: WRAPPER_HARNESS_REPO_ROOT,
    height: 80,
    startupTimeoutMs: 25_000,
    startupBudgetMs: 18_000,
  })
}

export function enterWrapperTmuxTranscriptMode(fixture: WrapperTmuxFixture): void {
  sendKeys(fixture.session, 'C-o')
}
