import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { join } from 'path'
import { detectIDEs, getIdeLockfilesPaths } from './ide.js'

const envKeys = [
  'HOME',
  'NCODE_CONFIG_DIR',
  'CLAUDE_CONFIG_DIR',
  'FORCE_CODE_TERMINAL',
  'CLAUDE_CODE_SSE_PORT',
] as const

const originalEnv = Object.fromEntries(
  envKeys.map(key => [key, process.env[key]]),
) as Record<(typeof envKeys)[number], string | undefined>

const tempDirs: string[] = []

afterEach(() => {
  for (const key of envKeys) {
    const value = originalEnv[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `${prefix}-`))
  tempDirs.push(dir)
  return dir
}

describe('IDE lockfile discovery', () => {
  test('uses NCode IDE lockfile paths under isolated config', async () => {
    const ncodeConfigDir = makeTempDir('ncode-ide-config')
    const claudeConfigDir = makeTempDir('claude-ide-config')
    process.env.NCODE_CONFIG_DIR = ncodeConfigDir
    process.env.CLAUDE_CONFIG_DIR = claudeConfigDir

    const paths = await getIdeLockfilesPaths()

    expect(paths).toContain(join(homedir(), '.ncode', 'ide'))
    expect(paths).toContain(join(ncodeConfigDir, 'ide'))
    expect(paths).not.toContain(join(claudeConfigDir, 'ide'))
    expect(paths).not.toContain(join(homedir(), '.claude', 'ide'))
  })

  test('detects a VS Code WebSocket lockfile with a string pid', async () => {
    const ncodeConfigDir = makeTempDir('ncode-ide-config')
    const claudeConfigDir = makeTempDir('claude-ide-config')
    process.env.NCODE_CONFIG_DIR = ncodeConfigDir
    process.env.CLAUDE_CONFIG_DIR = claudeConfigDir
    process.env.FORCE_CODE_TERMINAL = '1'
    delete process.env.CLAUDE_CODE_SSE_PORT

    const ideDir = join(ncodeConfigDir, 'ide')
    mkdirSync(ideDir, { recursive: true })
    writeFileSync(
      join(ideDir, '36818.lock'),
      JSON.stringify({
        pid: String(process.ppid),
        workspaceFolders: [process.cwd()],
        ideName: 'Visual Studio Code',
        transport: 'ws',
        runningInWindows: false,
        authToken: 'test-auth-token',
      }),
      'utf8',
    )

    const ides = await detectIDEs(false)

    expect(ides).toHaveLength(1)
    expect(ides[0]).toMatchObject({
      name: 'Visual Studio Code',
      port: 36818,
      url: 'ws://127.0.0.1:36818',
      authToken: 'test-auth-token',
      ideRunningInWindows: false,
    })
  })

  test('falls back to one live NCode IDE lockfile when workspace folders do not match', async () => {
    const homeDir = makeTempDir('ncode-ide-home')
    const ncodeConfigDir = makeTempDir('ncode-ide-config')
    const claudeConfigDir = makeTempDir('claude-ide-config')
    process.env.HOME = homeDir
    process.env.NCODE_CONFIG_DIR = ncodeConfigDir
    process.env.CLAUDE_CONFIG_DIR = claudeConfigDir
    delete process.env.FORCE_CODE_TERMINAL
    delete process.env.CLAUDE_CODE_SSE_PORT

    const ideDir = join(ncodeConfigDir, 'ide')
    mkdirSync(ideDir, { recursive: true })
    writeFileSync(
      join(ideDir, '46820.lock'),
      JSON.stringify({
        pid: process.ppid,
        workspaceFolders: [join(homeDir, 'different-workspace')],
        ideName: 'Visual Studio Code',
        transport: 'ws',
        runningInWindows: false,
        authToken: 'test-auth-token',
      }),
      'utf8',
    )

    const ides = await detectIDEs(false)

    expect(ides).toHaveLength(1)
    expect(ides[0]).toMatchObject({
      name: 'Visual Studio Code',
      port: 46820,
      url: 'ws://127.0.0.1:46820',
      isValid: true,
      authToken: 'test-auth-token',
    })
  })

  test('does not fall back when multiple workspace-mismatched IDE lockfiles are live', async () => {
    const homeDir = makeTempDir('ncode-ide-home')
    const ncodeConfigDir = makeTempDir('ncode-ide-config')
    const claudeConfigDir = makeTempDir('claude-ide-config')
    process.env.HOME = homeDir
    process.env.NCODE_CONFIG_DIR = ncodeConfigDir
    process.env.CLAUDE_CONFIG_DIR = claudeConfigDir
    delete process.env.FORCE_CODE_TERMINAL
    delete process.env.CLAUDE_CODE_SSE_PORT

    const ideDir = join(ncodeConfigDir, 'ide')
    mkdirSync(ideDir, { recursive: true })
    for (const port of [46821, 46822]) {
      writeFileSync(
        join(ideDir, `${port}.lock`),
        JSON.stringify({
          pid: process.ppid,
          workspaceFolders: [join(homeDir, `different-workspace-${port}`)],
          ideName: 'Visual Studio Code',
          transport: 'ws',
          runningInWindows: false,
        }),
        'utf8',
      )
    }

    const ides = await detectIDEs(false)

    expect(ides).toHaveLength(0)
  })
})
