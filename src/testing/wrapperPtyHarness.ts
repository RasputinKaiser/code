import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { fileURLToPath } from 'url'
import {
  createSharedSmokeEnv,
  getSmokeRuntimeConfig,
  writeSmokeGlobalConfig,
} from '../../tools/smoke/oauthHarness.mjs'
import { renderStarshipStatusLineText } from '../components/statusLine/starshipStatusLine.js'
import { getDisplayedEffortLevel } from '../utils/effort.js'
import {
  getLogoHeaderPrefixText,
} from '../utils/startupPromptOutput.js'
import { getThemeOnboardingVisibleRowContract } from '../utils/themeOnboardingOutput.js'
import {
  getRuntimeMainLoopModel,
  renderModelName,
} from '../utils/model/model.js'
import {
  spawnPtyContractSession,
  type PtyContractSession,
} from './ptyContractHarness.js'

export const WRAPPER_HARNESS_REPO_ROOT = fileURLToPath(
  new URL('../../', import.meta.url),
).replace(/\/$/, '')
const wrapperDir = fileURLToPath(new URL('../../', import.meta.url))
const WRAPPER_HARNESS_OAUTH_TOKEN =
  'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ3cmFwcGVyLXB0eS10ZXN0Iiwic2NvcGUiOiJ1c2VyOmluZmVyZW5jZSJ9.'

export type WrapperPtyFixture = {
  readonly tmpDir: string
  readonly configDir: string
  readonly session: PtyContractSession
  readonly cwd: string
  readonly startupTimeoutMs: number
  readonly startupBudgetMs: number
  readonly expectedRows: readonly string[]
  getElapsedMs: () => number
  cleanup: () => void
}

export function buildWrapperPromptFooterText(options?: {
  readonly cwd?: string
  readonly permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions'
}) {
  const runtimeConfig = getSmokeRuntimeConfig()
  const runtimeModel = getRuntimeMainLoopModel({
    permissionMode: options?.permissionMode ?? 'default',
    mainLoopModel: runtimeConfig.model,
    exceeds200kTokens: false,
  })
  return renderStarshipStatusLineText({
    modelName: renderModelName(runtimeModel),
    effortLevel: getDisplayedEffortLevel(runtimeModel, undefined),
    contextRemaining: null,
    cwd: options?.cwd ?? WRAPPER_HARNESS_REPO_ROOT,
    permissionMode: options?.permissionMode ?? 'default',
  })
}

export function buildWrapperPromptStatusPrefix(options?: {
  readonly permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions'
}) {
  const runtimeConfig = getSmokeRuntimeConfig()
  const runtimeModel = getRuntimeMainLoopModel({
    permissionMode: options?.permissionMode ?? 'default',
    mainLoopModel: runtimeConfig.model,
    exceeds200kTokens: false,
  })
  return `◉ ${renderModelName(runtimeModel)} · ${getDisplayedEffortLevel(runtimeModel, undefined)}`
}

export function createWrapperEnv(
  configDir: string,
  extraEnv: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  const env = createSharedSmokeEnv(configDir, getSmokeRuntimeConfig(), {
    NCODE_BUILD_MODE: process.env.NCODE_BUILD_MODE || 'noumena',
    NCODE_DISABLE_STDIN_TTY_OVERRIDE: '1',
    CLAUDE_CODE_NO_FLICKER: '0',
    NOUMENA_OAUTH_WEB_BASE_URL:
      process.env.NOUMENA_OAUTH_WEB_BASE_URL || 'https://api.noumena.com',
    NOUMENA_GROWTHBOOK_API_HOST:
      process.env.NOUMENA_GROWTHBOOK_API_HOST || 'https://flags.noumena.com',
    NOUMENA_GROWTHBOOK_CLIENT_KEY:
      process.env.NOUMENA_GROWTHBOOK_CLIENT_KEY || 'sdk-4goZclgHgKG2mtsb',
    CLAUDE_CODE_OAUTH_TOKEN:
      process.env.CLAUDE_CODE_OAUTH_TOKEN || WRAPPER_HARNESS_OAUTH_TOKEN,
    ...extraEnv,
  })

  // Wrapper fixtures exercise the managed OAuth path. Ambient direct API keys
  // from the developer shell trigger the interactive "use this API key?"
  // prompt before the steady-state wrapper surface, making the contracts
  // depend on unrelated local state. Use empty overrides instead of deletion:
  // spawnPtyContractSession merges process.env back in after this env object.
  // Preserve explicit overrides for tests that intentionally exercise API-key
  // behavior.
  for (const key of ['ANTHROPIC_API_KEY', 'NOUMENA_API_KEY'] as const) {
    if (!(key in extraEnv)) {
      env[key] = ''
    }
  }

  return env
}

export function getWrapperHarnessBunBin(): string {
  return process.env.BUN_BIN || process.execPath
}

export async function prepareWrapperConfigDir(
  configDir: string,
  env: NodeJS.ProcessEnv,
  config: Record<string, unknown>,
): Promise<string> {
  mkdirSync(configDir, { recursive: true })
  return await writeSmokeGlobalConfig(configDir, env, config)
}

export function buildTrustedWrapperGlobalConfig(
  config: Record<string, unknown> = {},
): Record<string, unknown> {
  const projects =
    typeof config.projects === 'object' && config.projects !== null
      ? (config.projects as Record<string, unknown>)
      : {}
  const existingProjectConfig =
    typeof projects[WRAPPER_HARNESS_REPO_ROOT] === 'object' &&
    projects[WRAPPER_HARNESS_REPO_ROOT] !== null
      ? (projects[WRAPPER_HARNESS_REPO_ROOT] as Record<string, unknown>)
      : {}

  return {
    ...config,
    hasSeenUndercoverAutoNotice: true,
    projects: {
      ...projects,
      [WRAPPER_HARNESS_REPO_ROOT]: {
        ...existingProjectConfig,
        hasTrustDialogAccepted: true,
      },
    },
  }
}

function createFixture(
  commandArgs: readonly string[],
  expectedRows: readonly string[],
  options?: {
    readonly tmpDir?: string
    readonly configDir?: string
    readonly cwd?: string
    readonly env?: NodeJS.ProcessEnv
    readonly startupTimeoutMs?: number
    readonly startupBudgetMs?: number
  },
): WrapperPtyFixture {
  const tmpDir = options?.tmpDir ?? mkdtempSync(join(tmpdir(), 'code-wrapper-pty-'))
  const configDir = options?.configDir ?? join(tmpDir, 'config')
  mkdirSync(configDir, { recursive: true })
  const startedAt = Date.now()
  const session = spawnPtyContractSession(commandArgs, {
    cwd: options?.cwd ?? WRAPPER_HARNESS_REPO_ROOT,
    env: options?.env,
    columns: 120,
    lines: 40,
  })

  return {
    tmpDir,
    configDir,
    session,
    cwd: options?.cwd ?? WRAPPER_HARNESS_REPO_ROOT,
    startupTimeoutMs: options?.startupTimeoutMs ?? 25_000,
    startupBudgetMs: options?.startupBudgetMs ?? 18_000,
    expectedRows,
    getElapsedMs() {
      return Date.now() - startedAt
    },
    cleanup() {
      session.terminate()
      rmSync(tmpDir, { recursive: true, force: true })
    },
  }
}

export function buildSteadyStateWrapperExpectedRows(
  cwd = WRAPPER_HARNESS_REPO_ROOT,
): readonly string[] {
  return [
    getLogoHeaderPrefixText(),
    cwd,
    '❯',
    buildWrapperPromptStatusPrefix(),
  ]
}

export function buildWrapperOnboardingExpectedRows(): readonly string[] {
  return getThemeOnboardingVisibleRowContract({
    includeAutoTheme: false,
  })
}

export function resolveStagingWrapperPath(): string {
  const stagingPath = fileURLToPath(new URL('../../ncode-staging', import.meta.url))
  return existsSync(stagingPath)
    ? stagingPath
    : (resolveCompiledBinaryPath() ??
        fileURLToPath(new URL('../../ncode', import.meta.url)))
}

export function resolveSelfContainedWrapperPath(): string {
  const selfContainedPath = fileURLToPath(new URL('../../ncode-staging-self-contained', import.meta.url))
  return existsSync(selfContainedPath)
    ? selfContainedPath
    : (resolveCompiledBinaryPath() ??
        fileURLToPath(new URL('../../ncode', import.meta.url)))
}

export function findCompiledBinaryCandidates(
  repoRoot = WRAPPER_HARNESS_REPO_ROOT,
): string[] {
  const explicitBinary = process.env.NCODE_TEST_COMPILED_BINARY
  if (explicitBinary && existsSync(explicitBinary)) {
    return [explicitBinary]
  }

  const packageRoot = join(repoRoot, '.tmp', 'packages')
  if (existsSync(packageRoot)) {
    const packageMatches = readdirSync(packageRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => join(packageRoot, entry.name, process.platform === 'win32' ? 'ncode.exe' : 'ncode'))
      .filter(candidate => existsSync(candidate))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    if (packageMatches.length > 0) {
      return packageMatches
    }
  }

  const buckOutRoot = join(repoRoot, 'buck-out')
  if (!existsSync(buckOutRoot)) {
    return []
  }

  const candidateRoots = readdirSync(buckOutRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .flatMap(entry => [
      join(buckOutRoot, entry.name, 'art/fbcode'),
      join(buckOutRoot, entry.name, 'gen/fbcode'),
    ])
    .filter(candidateRoot => existsSync(candidateRoot))

  const matches = candidateRoots
    .flatMap(candidateRoot =>
      readdirSync(candidateRoot, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry =>
          join(candidateRoot, entry.name, 'code/__self_contained_bin__/out/ncode'),
        ),
    )
    .filter(candidate => existsSync(candidate))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)

  return matches
}

export function resolveCompiledBinaryPath(
  repoRoot = WRAPPER_HARNESS_REPO_ROOT,
): string | null {
  const matches = findCompiledBinaryCandidates(repoRoot)
  if (matches.length === 0) {
    return null
  }
  return matches[0]!
}

export function requireCompiledBinaryPath(): string {
  let compiledBinaryPath = resolveCompiledBinaryPath()
  if (!compiledBinaryPath) {
    const build = Bun.spawnSync({
      cmd: [
        getWrapperHarnessBunBin(),
        './build/package.mjs',
        '--build-mode',
        'external',
        '--skip-archive',
      ],
      cwd: WRAPPER_HARNESS_REPO_ROOT,
      stdout: 'inherit',
      stderr: 'inherit',
    })
    if (build.exitCode === 0) {
      compiledBinaryPath = resolveCompiledBinaryPath()
    }
  }
  if (compiledBinaryPath) {
    return compiledBinaryPath
  }

  throw new Error(
    [
      'Missing self-contained artifact for wrapper PTY tests.',
      'Build it first with:',
      '  bun run build',
    ].join('\n'),
  )
}

export async function spawnStagingWrapperPromptFixture(): Promise<WrapperPtyFixture> {
  const compiledBinaryPath = requireCompiledBinaryPath()

  const tmpDir = mkdtempSync(join(tmpdir(), 'code-wrapper-pty-'))
  const configDir = join(tmpDir, 'config')
  const env = createWrapperEnv(configDir, {
    HOME: tmpDir,
    BUN_BIN: getWrapperHarnessBunBin(),
    NCODE_EXECUTABLE: compiledBinaryPath,
  })
  await prepareWrapperConfigDir(
    configDir,
    env,
    buildTrustedWrapperGlobalConfig({
      theme: 'dark',
      hasCompletedOnboarding: true,
    }),
  )

  const fixture = createFixture(
    [resolveStagingWrapperPath()],
    buildSteadyStateWrapperExpectedRows(WRAPPER_HARNESS_REPO_ROOT),
    {
      tmpDir,
      configDir,
      cwd: WRAPPER_HARNESS_REPO_ROOT,
      env,
      startupTimeoutMs: 20_000,
      startupBudgetMs: 15_000,
    },
  )

  return {
    ...fixture,
    tmpDir,
    configDir,
    cleanup() {
      fixture.cleanup()
    },
  }
}

export async function spawnSelfContainedWrapperPromptFixture(): Promise<WrapperPtyFixture> {
  requireCompiledBinaryPath()

  const tmpDir = mkdtempSync(join(tmpdir(), 'code-self-contained-pty-'))
  const configDir = join(tmpDir, 'config')
  const env = createWrapperEnv(configDir, {
    HOME: tmpDir,
    BUN_BIN: getWrapperHarnessBunBin(),
  })
  await prepareWrapperConfigDir(
    configDir,
    env,
    buildTrustedWrapperGlobalConfig({
      theme: 'dark',
      hasCompletedOnboarding: true,
    }),
  )

  const fixture = createFixture(
    [resolveSelfContainedWrapperPath()],
    buildSteadyStateWrapperExpectedRows(WRAPPER_HARNESS_REPO_ROOT),
    {
      tmpDir,
      configDir,
      cwd: WRAPPER_HARNESS_REPO_ROOT,
      env,
      startupTimeoutMs: 25_000,
      startupBudgetMs: 18_000,
    },
  )

  return {
    ...fixture,
    tmpDir,
    configDir,
    cleanup() {
      fixture.cleanup()
    },
  }
}

export async function spawnSelfContainedWrapperOnboardingFixture(): Promise<WrapperPtyFixture> {
  requireCompiledBinaryPath()

  const tmpDir = mkdtempSync(join(tmpdir(), 'code-self-contained-onboarding-pty-'))
  const configDir = join(tmpDir, 'config')
  const env = createWrapperEnv(configDir, {
    HOME: tmpDir,
    BUN_BIN: getWrapperHarnessBunBin(),
  })
  await prepareWrapperConfigDir(
    configDir,
    env,
    buildTrustedWrapperGlobalConfig(),
  )

  const fixture = createFixture(
    [resolveSelfContainedWrapperPath()],
    buildWrapperOnboardingExpectedRows(),
    {
      tmpDir,
      configDir,
      cwd: WRAPPER_HARNESS_REPO_ROOT,
      env,
      startupTimeoutMs: 25_000,
      startupBudgetMs: 18_000,
    },
  )

  return {
    ...fixture,
    tmpDir,
    configDir,
    cleanup() {
      fixture.cleanup()
    },
  }
}
