import { afterEach, describe, expect, it } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  buildTrustedWrapperGlobalConfig,
  buildSteadyStateWrapperExpectedRows,
  buildWrapperPromptStatusPrefix,
  createWrapperEnv,
  findCompiledBinaryCandidates,
  getWrapperHarnessBunBin,
  prepareWrapperConfigDir,
  resolveCompiledBinaryPath,
  WRAPPER_HARNESS_REPO_ROOT,
} from './wrapperPtyHarness.js'

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true })
  }
})

function createArtifact(
  repoRoot: string,
  bucket: string,
  mtimeMs: number,
  options?: {
    readonly isolationDir?: string
    readonly tree?: 'art' | 'gen'
  },
): string {
  const artifactPath = join(
    repoRoot,
    options?.isolationDir
      ? `buck-out/${options.isolationDir}/${options.tree ?? 'art'}/fbcode`
      : `buck-out/v2/${options?.tree ?? 'art'}/fbcode`,
    bucket,
    'code/__self_contained_bin__/out/ncode',
  )
  mkdirSync(join(artifactPath, '..'), { recursive: true })
  writeFileSync(artifactPath, `artifact:${bucket}\n`, 'utf8')
  const seconds = mtimeMs / 1000
  utimesSync(artifactPath, seconds, seconds)
  return artifactPath
}

describe('wrapperPtyHarness artifact resolution', () => {
  it('finds self-contained artifact candidates by explicit directory walk', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'wrapper-artifacts-'))
    tempDirs.push(repoRoot)

    const older = createArtifact(repoRoot, 'older', 1_000)
    const newer = createArtifact(repoRoot, 'newer', 2_000)
    const isolated = createArtifact(repoRoot, 'isolated', 3_000, {
      isolationDir: 'codex-self-contained-artifact-pty-test',
      tree: 'gen',
    })

    expect(findCompiledBinaryCandidates(repoRoot)).toEqual([isolated, newer, older])
    expect(resolveCompiledBinaryPath(repoRoot)).toBe(isolated)
  })

  it('creates the wrapper config dir before writing the staging global config', async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'wrapper-config-'))
    tempDirs.push(repoRoot)

    const configDir = join(repoRoot, 'config')
    const env = createWrapperEnv(configDir)
    const configPath = await prepareWrapperConfigDir(configDir, env, {
      theme: 'dark',
      hasCompletedOnboarding: true,
    })

    expect(existsSync(configDir)).toBe(true)
    expect(existsSync(configPath)).toBe(true)
    expect(JSON.parse(readFileSync(configPath, 'utf8'))).toEqual({
      theme: 'dark',
      hasCompletedOnboarding: true,
    })
  })

  it('forces trusted-workspace state while preserving other project config fields', () => {
    expect(
      buildTrustedWrapperGlobalConfig({
        theme: 'dark',
        projects: {
          '/tmp/other': { hasTrustDialogAccepted: false },
          '/mlstore/src/noumena/ncode': {
            hasCompletedProjectOnboarding: true,
          },
        },
      }),
    ).toEqual({
      theme: 'dark',
      hasSeenUndercoverAutoNotice: true,
      projects: {
        '/tmp/other': { hasTrustDialogAccepted: false },
        '/mlstore/src/noumena/ncode': {
          hasCompletedProjectOnboarding: true,
        },
        [WRAPPER_HARNESS_REPO_ROOT]: { hasTrustDialogAccepted: true },
      },
    })
  })

  it('uses the stable visible status prefix in the steady-state wrapper row contract', () => {
    expect(buildSteadyStateWrapperExpectedRows('/tmp/repo')).toEqual([
      'Code v',
      '/tmp/repo',
      '❯',
      buildWrapperPromptStatusPrefix(),
    ])
  })

  it('preserves an explicit HOME override so wrapper fixtures can isolate user-home seeding', () => {
    const env = createWrapperEnv('/tmp/config', {
      HOME: '/tmp/wrapper-home',
      BUN_BIN: '/tmp/custom-bun',
    })

    expect(env.HOME).toBe('/tmp/wrapper-home')
    expect(env.BUN_BIN).toBe('/tmp/custom-bun')
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBeString()
    expect(env.CLAUDE_CODE_OAUTH_TOKEN?.split('.')).toHaveLength(3)
  })

  it('shadows ambient direct API keys so wrapper fixtures stay on managed OAuth', () => {
    const previousAnthropicKey = process.env.ANTHROPIC_API_KEY
    const previousNoumenaKey = process.env.NOUMENA_API_KEY
    process.env.ANTHROPIC_API_KEY = 'ambient-anthropic-key'
    process.env.NOUMENA_API_KEY = 'ambient-noumena-key'
    try {
      const env = createWrapperEnv('/tmp/config')

      expect(env.ANTHROPIC_API_KEY).toBe('')
      expect(env.NOUMENA_API_KEY).toBe('')
    } finally {
      if (previousAnthropicKey === undefined) {
        delete process.env.ANTHROPIC_API_KEY
      } else {
        process.env.ANTHROPIC_API_KEY = previousAnthropicKey
      }
      if (previousNoumenaKey === undefined) {
        delete process.env.NOUMENA_API_KEY
      } else {
        process.env.NOUMENA_API_KEY = previousNoumenaKey
      }
    }
  })

  it('preserves explicit direct API key overrides for API-key-specific tests', () => {
    const env = createWrapperEnv('/tmp/config', {
      ANTHROPIC_API_KEY: 'explicit-anthropic-key',
      NOUMENA_API_KEY: 'explicit-noumena-key',
    })

    expect(env.ANTHROPIC_API_KEY).toBe('explicit-anthropic-key')
    expect(env.NOUMENA_API_KEY).toBe('explicit-noumena-key')
  })

  it('pins wrapper render flags instead of inheriting prior test process state', () => {
    const previousNoFlicker = process.env.CLAUDE_CODE_NO_FLICKER
    const previousTtyOverride = process.env.NCODE_DISABLE_STDIN_TTY_OVERRIDE
    process.env.CLAUDE_CODE_NO_FLICKER = '1'
    process.env.NCODE_DISABLE_STDIN_TTY_OVERRIDE = '0'
    try {
      const env = createWrapperEnv('/tmp/config')

      expect(env.CLAUDE_CODE_NO_FLICKER).toBe('0')
      expect(env.NCODE_DISABLE_STDIN_TTY_OVERRIDE).toBe('1')
    } finally {
      if (previousNoFlicker === undefined) {
        delete process.env.CLAUDE_CODE_NO_FLICKER
      } else {
        process.env.CLAUDE_CODE_NO_FLICKER = previousNoFlicker
      }
      if (previousTtyOverride === undefined) {
        delete process.env.NCODE_DISABLE_STDIN_TTY_OVERRIDE
      } else {
        process.env.NCODE_DISABLE_STDIN_TTY_OVERRIDE = previousTtyOverride
      }
    }
  })

  it('pins the wrapper harness Bun path away from HOME-derived defaults', () => {
    expect(getWrapperHarnessBunBin()).toBe(process.env.BUN_BIN || process.execPath)
  })
})
