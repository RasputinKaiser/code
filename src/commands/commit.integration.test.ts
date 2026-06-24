import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from 'bun:test'
import { mkdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { executeShellCommandsInPrompt } from '../utils/promptShellExecution.js'
import { runWithCwdOverride } from '../utils/cwd.js'

const BASE_TMP = '/tmp/ncode-commit-integration'

// Sapling lives in tools/buck/ on this machine; add it to PATH for the test.
process.env.PATH = `${process.env.PATH || ''}:/mlstore/src/noumena/ncode/tools/buck`

function createToolUseContext(allowedTools: string[]) {
  const appState = {
    toolPermissionContext: {
      mode: 'default' as const,
      alwaysAllowRules: {
        command: allowedTools,
      },
      alwaysDenyRules: {},
      alwaysAskRules: {},
      sessionApprovedTools: new Set(),
      explicitDenials: [],
      trackDenial: () => {},
      sessionApprovedCommands: new Set(),
      commandFingerprintToToolName: new Map(),
      additionalWorkingDirectories: new Map(),
    },
    fastMode: false,
    sessionHooks: new Map(),
    mcp: { tools: [], clients: [] },
    effortValue: undefined,
    advisorModel: undefined,
    messages: [],
    replBridgeEnabled: false,
    mainLoopModelForSession: null,
    mainLoopModel: null,
    denialTracking: {
      consecutiveDenials: 0,
      totalDenials: 0,
      lastDeniedAt: null,
      classifierConsecutiveDenials: 0,
      classifierTotalDenials: 0,
    },
  }

  return {
    abortController: new AbortController(),
    readFileState: { get: () => undefined, set: () => {}, clear: () => {} },
    getAppState: () => appState,
    setAppState: () => {},
    setAppStateForTasks: () => {},
    updateAttributionState: () => {},
    addNotification: () => {},
    options: {
      commands: [],
      debug: false,
      mainLoopModel: 'test',
      tools: [],
      verbose: false,
      thinkingConfig: { enabled: false },
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: false,
      agentDefinitions: { agents: [], activeAgentType: null },
    },
  } as never
}

const COMMIT_ALLOWED_TOOLS = [
  'Bash(git add:*)',
  'Bash(git status:*)',
  'Bash(git diff:*)',
  'Bash(git branch:*)',
  'Bash(git log:*)',
  'Bash(git commit:*)',
  'Bash(sl add:*)',
  'Bash(sl status:*)',
  'Bash(sl diff:*)',
  'Bash(sl book:*)',
  'Bash(sl smartlog:*)',
  'Bash(sl log:*)',
  'Bash(sl commit:*)',
]

describe('/commit skill real command execution', () => {
  beforeEach(async () => {
    await rm(BASE_TMP, { recursive: true, force: true })
    await mkdir(BASE_TMP, { recursive: true })
  })

  afterEach(async () => {
    await rm(BASE_TMP, { recursive: true, force: true })
  })

  it('git repo: inline !`git status` executes and substitutes output', async () => {
    const repo = join(BASE_TMP, 'git-repo')
    await mkdir(repo, { recursive: true })

    const init = Bun.spawn(['git', 'init', '--quiet'], { cwd: repo })
    await init.exited
    if (init.exitCode !== 0) throw new Error('git init failed')

    for (const [k, v] of [
      ['user.email', 'test@test.com'],
      ['user.name', 'Test User'],
    ]) {
      const p = Bun.spawn(['git', 'config', k, v], { cwd: repo })
      await p.exited
    }

    await writeFile(join(repo, 'README'), 'hello')
    const add = Bun.spawn(['git', 'add', 'README'], { cwd: repo })
    await add.exited
    const commit = Bun.spawn(['git', 'commit', '-m', 'init', '--quiet'], { cwd: repo })
    await commit.exited
    await writeFile(join(repo, 'foo.txt'), 'bar')

    const prompt = `Repo status:\n !\`git status\`\nBranch:\n !\`git branch --show-current\``
    const result = await runWithCwdOverride(repo, async () =>
      executeShellCommandsInPrompt(
        prompt,
        createToolUseContext(COMMIT_ALLOWED_TOOLS),
        '/commit',
      )
    )

    expect(result).not.toContain("!`git status`")
    expect(result).not.toContain("!`git branch --show-current`")
    expect(result).toContain('foo.txt')
    expect(result).toContain('master')
  })

  it('sl repo: inline !`sl status` executes and substitutes output', async () => {
    const repo = join(BASE_TMP, 'sl-repo')
    await mkdir(repo, { recursive: true })

    const init = Bun.spawn(['sl', 'init', '--git', '--quiet', repo])
    await init.exited
    if (init.exitCode !== 0) throw new Error(`sl init failed: exit=${init.exitCode}`)

    await writeFile(join(repo, 'README'), 'hello')
    const add = Bun.spawn(['sl', 'add', 'README'], { cwd: repo })
    await add.exited
    const commit = Bun.spawn(['sl', 'commit', '-m', 'init'], { cwd: repo })
    await commit.exited
    await writeFile(join(repo, 'foo.txt'), 'bar')

    const prompt = `Repo diff:\n !\`sl diff\`\nRecent commits:\n !\`sl log -l 5 -T '{node|short} {desc|firstline}'\``
    const result = await runWithCwdOverride(repo, async () =>
      executeShellCommandsInPrompt(
        prompt,
        createToolUseContext(COMMIT_ALLOWED_TOOLS),
        '/commit',
      )
    )

    expect(result).not.toContain("!`sl diff`")
    expect(result).not.toContain("!`sl log -l 5 -T")
    expect(result).toContain('init')
  })

  it('git repo: failing context command substitutes error instead of crashing', async () => {
    const repo = join(BASE_TMP, 'git-empty')
    await mkdir(repo, { recursive: true })

    const init = Bun.spawn(['git', 'init', '--quiet'], { cwd: repo })
    await init.exited

    // NEVER commit — git log should fail in this empty repo
    const prompt = 'Commits:\n !`git log --oneline -10`'
    const result = await runWithCwdOverride(repo, async () =>
      executeShellCommandsInPrompt(
        prompt,
        createToolUseContext(COMMIT_ALLOWED_TOOLS),
        '/commit',
      )
    )

    // Must NOT crash — the error should be substituted inline
    expect(result).not.toContain("!`git log --oneline -10`")
    expect(result.toLowerCase()).toContain('fatal')
  })

  it('sl repo: failing context command substitutes error instead of crashing', async () => {
    const repo = join(BASE_TMP, 'sl-empty')
    await mkdir(repo, { recursive: true })

    const init = Bun.spawn(['sl', 'init', '--git', '--quiet', repo])
    await init.exited

    // NEVER commit — sl smartlog may fail or be empty in this fresh repo
    const prompt = 'Smartlog:\n !`sl smartlog`'
    const result = await runWithCwdOverride(repo, async () =>
      executeShellCommandsInPrompt(
        prompt,
        createToolUseContext(COMMIT_ALLOWED_TOOLS),
        '/commit',
      )
    )

    // Must NOT crash — either it worked (empty but no crash) or error is inline
    expect(result).not.toContain("!`sl smartlog`")
  })
})
