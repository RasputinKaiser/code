import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { mkdir, mkdtemp } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const analyticsEvents: Array<{ name: string; metadata: Record<string, unknown> }> = []
const worktreeCalls = {
  setOriginalCwd: [] as string[],
  setProjectRoot: [] as string[],
  setCwd: [] as string[],
  saveWorktreeState: [] as unknown[],
  keepWorktree: 0,
  cleanupWorktree: 0,
  killTmuxSession: [] as string[],
  clearSystemPromptSections: 0,
  clearMemoryFileCaches: 0,
  updateHooksConfigSnapshot: 0,
  createWorktreeForSession: [] as Array<{ sessionId: string; slug: string }>,
  clearPlansDirectoryCache: 0,
}

let currentCwd = process.cwd()
let mockCanonicalGitRoot = process.cwd()
let mockSessionId = 'session-1'
let mockBootstrapOriginalCwd = '/original'
let mockBootstrapProjectRoot = '/repo'
let mockCurrentWorktreeSession: any = null
let mockCreatedWorktreeSession: any = null
let mockStatusStdout = ''
let mockRevListStdout = '0\n'

const bootstrapStatePaths = [
  import.meta.resolve('../bootstrap/state.ts'),
  import.meta.resolve('../bootstrap/state.js'),
]
const systemPromptSectionPaths = [
  import.meta.resolve('../constants/systemPromptSections.ts'),
  import.meta.resolve('../constants/systemPromptSections.js'),
]
const claudemdPaths = [
  import.meta.resolve('../utils/claudemd.ts'),
  import.meta.resolve('../utils/claudemd.js'),
]
const cwdPaths = [
  import.meta.resolve('../utils/cwd.ts'),
  import.meta.resolve('../utils/cwd.js'),
]
const gitPaths = [
  import.meta.resolve('../utils/git.ts'),
  import.meta.resolve('../utils/git.js'),
]
const plansPaths = [
  import.meta.resolve('../utils/plans.ts'),
  import.meta.resolve('../utils/plans.js'),
]
const shellPaths = [
  import.meta.resolve('../utils/Shell.ts'),
  import.meta.resolve('../utils/Shell.js'),
]
const sessionStoragePaths = [
  import.meta.resolve('../utils/sessionStorage.ts'),
  import.meta.resolve('../utils/sessionStorage.js'),
]
const worktreePaths = [
  import.meta.resolve('../utils/worktree.ts'),
  import.meta.resolve('../utils/worktree.js'),
]
const analyticsPaths = [
  import.meta.resolve('../services/analytics/index.ts'),
  import.meta.resolve('../services/analytics/index.js'),
]
const execFileNoThrowPaths = [
  import.meta.resolve('../utils/execFileNoThrow.ts'),
  import.meta.resolve('../utils/execFileNoThrow.js'),
]
const hookSnapshotPaths = [
  import.meta.resolve('../utils/hooks/hooksConfigSnapshot.ts'),
  import.meta.resolve('../utils/hooks/hooksConfigSnapshot.js'),
]

const actualBootstrapState = await import(
  import.meta.resolve('../bootstrap/state.ts'),
)
const actualGit = await import(import.meta.resolve('../utils/git.ts'))
const actualPlans = await import(import.meta.resolve('../utils/plans.ts'))
const actualWorktree = await import(import.meta.resolve('../utils/worktree.ts'))

for (const bootstrapStatePath of bootstrapStatePaths) {
  mock.module(bootstrapStatePath, () => ({
    ...actualBootstrapState,
    getSessionId: () => mockSessionId,
    getOriginalCwd: () => mockBootstrapOriginalCwd,
    setOriginalCwd(value: string) {
      worktreeCalls.setOriginalCwd.push(value)
      mockBootstrapOriginalCwd = value
    },
    getProjectRoot: () => mockBootstrapProjectRoot,
    setProjectRoot(value: string) {
      worktreeCalls.setProjectRoot.push(value)
      mockBootstrapProjectRoot = value
    },
  }))
}

for (const systemPromptSectionPath of systemPromptSectionPaths) {
  mock.module(systemPromptSectionPath, () => ({
    clearSystemPromptSections() {
      worktreeCalls.clearSystemPromptSections += 1
    },
  }))
}

for (const claudemdPath of claudemdPaths) {
  mock.module(claudemdPath, () => ({
    clearMemoryFileCaches() {
      worktreeCalls.clearMemoryFileCaches += 1
    },
  }))
}

for (const cwdPath of cwdPaths) {
  mock.module(cwdPath, () => ({
    getCwd: () => currentCwd,
  }))
}

for (const gitPath of gitPaths) {
  mock.module(gitPath, () => ({
    ...actualGit,
    findCanonicalGitRoot: () => mockCanonicalGitRoot,
  }))
}

for (const plansPath of plansPaths) {
  const getPlansDirectory = () => '/tmp/plans'
  ;(getPlansDirectory as typeof actualPlans.getPlansDirectory & {
    cache?: { clear?: () => void }
  }).cache = {
    clear() {
      worktreeCalls.clearPlansDirectoryCache += 1
    },
  }

  mock.module(plansPath, () => ({
    ...actualPlans,
    getPlanSlug: () => 'auto-plan',
    getPlansDirectory,
  }))
}

for (const shellPath of shellPaths) {
  mock.module(shellPath, () => ({
    setCwd(value: string) {
      worktreeCalls.setCwd.push(value)
      currentCwd = value
    },
  }))
}

for (const sessionStoragePath of sessionStoragePaths) {
  mock.module(sessionStoragePath, () => ({
    saveWorktreeState(value: unknown) {
      worktreeCalls.saveWorktreeState.push(value)
      mockCurrentWorktreeSession = value
    },
  }))
}

for (const worktreePath of worktreePaths) {
  mock.module(worktreePath, () => ({
    ...actualWorktree,
    createWorktreeForSession: async (sessionId: string, slug: string) => {
      worktreeCalls.createWorktreeForSession.push({ sessionId, slug })
      mockCurrentWorktreeSession = mockCreatedWorktreeSession
      return mockCreatedWorktreeSession
    },
    getCurrentWorktreeSession: () => mockCurrentWorktreeSession,
    keepWorktree: async () => {
      worktreeCalls.keepWorktree += 1
      mockCurrentWorktreeSession = null
    },
    cleanupWorktree: async () => {
      worktreeCalls.cleanupWorktree += 1
      mockCurrentWorktreeSession = null
    },
    killTmuxSession: async (name: string) => {
      worktreeCalls.killTmuxSession.push(name)
    },
  }))
}

for (const analyticsPath of analyticsPaths) {
  mock.module(analyticsPath, () => ({
    logEvent(name: string, metadata: Record<string, unknown>) {
      analyticsEvents.push({ name, metadata })
    },
  }))
}

for (const execFileNoThrowPath of execFileNoThrowPaths) {
  mock.module(execFileNoThrowPath, () => ({
    execFileNoThrow: async (_command: string, args: string[]) => {
      if (args.includes('status')) {
        return { code: 0, stdout: mockStatusStdout, stderr: '' }
      }
      if (args.includes('rev-list')) {
        return { code: 0, stdout: mockRevListStdout, stderr: '' }
      }
      return { code: 0, stdout: '', stderr: '' }
    },
  }))
}

for (const hookSnapshotPath of hookSnapshotPaths) {
  mock.module(hookSnapshotPath, () => ({
    updateHooksConfigSnapshot() {
      worktreeCalls.updateHooksConfigSnapshot += 1
    },
  }))
}

const { EnterWorktreeTool } = await import(
  import.meta.resolve('./EnterWorktreeTool/EnterWorktreeTool.ts'),
)
const { ExitWorktreeTool } = await import(
  import.meta.resolve('./ExitWorktreeTool/ExitWorktreeTool.ts'),
)

const originalProcessCwd = process.cwd()

beforeEach(() => {
  analyticsEvents.length = 0
  worktreeCalls.setOriginalCwd.length = 0
  worktreeCalls.setProjectRoot.length = 0
  worktreeCalls.setCwd.length = 0
  worktreeCalls.saveWorktreeState.length = 0
  worktreeCalls.keepWorktree = 0
  worktreeCalls.cleanupWorktree = 0
  worktreeCalls.killTmuxSession.length = 0
  worktreeCalls.clearSystemPromptSections = 0
  worktreeCalls.clearMemoryFileCaches = 0
  worktreeCalls.updateHooksConfigSnapshot = 0
  worktreeCalls.createWorktreeForSession.length = 0
  worktreeCalls.clearPlansDirectoryCache = 0
  mockSessionId = 'session-1'
  mockBootstrapOriginalCwd = '/original'
  mockBootstrapProjectRoot = '/repo'
  mockCurrentWorktreeSession = null
  mockCreatedWorktreeSession = null
  mockStatusStdout = ''
  mockRevListStdout = '0\n'
  currentCwd = originalProcessCwd
  process.chdir(originalProcessCwd)
})

afterEach(() => {
  currentCwd = originalProcessCwd
  process.chdir(originalProcessCwd)
})

describe('worktree tool runtime contract', () => {
  it('creates a worktree session and switches the session into it', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'ncode-worktree-repo-'))
    const nestedCwd = join(repoRoot, 'src')
    const worktreePath = join(repoRoot, '.ncode', 'worktrees', 'feature')
    await mkdir(nestedCwd, { recursive: true })
    await mkdir(worktreePath, { recursive: true })

    currentCwd = nestedCwd
    mockCanonicalGitRoot = repoRoot
    mockCreatedWorktreeSession = {
      originalCwd: nestedCwd,
      worktreePath,
      worktreeName: 'feature',
      worktreeBranch: 'worktree-feature',
      sessionId: mockSessionId,
    }

    process.chdir(nestedCwd)

    const result = await EnterWorktreeTool.call!(
      { name: 'feature' },
      {} as never,
      async (_tool, input) => ({
        behavior: 'allow',
        updatedInput: input,
      }),
      {} as never,
    )

    expect(worktreeCalls.createWorktreeForSession).toEqual([
      { sessionId: 'session-1', slug: 'feature' },
    ])
    expect(worktreeCalls.setCwd).toEqual([repoRoot, worktreePath])
    expect(worktreeCalls.setOriginalCwd).toEqual([worktreePath])
    expect(worktreeCalls.saveWorktreeState).toEqual([mockCreatedWorktreeSession])
    expect(worktreeCalls.clearSystemPromptSections).toBe(1)
    expect(worktreeCalls.clearMemoryFileCaches).toBe(1)
    expect(worktreeCalls.clearPlansDirectoryCache).toBe(1)
    expect(process.cwd()).toBe(worktreePath)
    expect(result.data).toMatchObject({
      worktreePath,
      worktreeBranch: 'worktree-feature',
    })
    expect(result.data.message).toContain(worktreePath)
    expect(analyticsEvents).toEqual([
      {
        name: 'ncode_worktree_created',
        metadata: { mid_session: true },
      },
    ])
  })

  it('refuses ExitWorktree validation when there is no active session', async () => {
    const result = await ExitWorktreeTool.validateInput!(
      { action: 'keep' },
      {} as never,
    )

    expect(result).toEqual({
      result: false,
      message:
        'No-op: there is no active EnterWorktree session to exit. This tool only operates on worktrees created by EnterWorktree in the current session — it will not touch worktrees created manually or in a previous session. No filesystem changes were made.',
      errorCode: 1,
    })
  })

  it('requires explicit discard confirmation before removing a dirty worktree', async () => {
    mockCurrentWorktreeSession = {
      originalCwd: '/repo',
      worktreePath: '/repo/.ncode/worktrees/feature',
      worktreeName: 'feature',
      worktreeBranch: 'worktree-feature',
      originalHeadCommit: 'abc123',
      sessionId: mockSessionId,
    }
    mockStatusStdout = ' M src/app.ts\n?? notes.txt\n'
    mockRevListStdout = '2\n'

    const result = await ExitWorktreeTool.validateInput!(
      { action: 'remove' },
      {} as never,
    )

    expect(result).toEqual({
      result: false,
      message:
        'Worktree has 2 uncommitted files and 2 commits on worktree-feature. Removing will discard this work permanently. Confirm with the user, then re-invoke with discard_changes: true — or use action: "keep" to preserve the worktree.',
      errorCode: 2,
    })
  })

  it('keeps a worktree and restores the original session directory', async () => {
    mockCurrentWorktreeSession = {
      originalCwd: '/repo',
      worktreePath: '/repo/.ncode/worktrees/feature',
      worktreeName: 'feature',
      worktreeBranch: 'worktree-feature',
      originalHeadCommit: 'abc123',
      sessionId: mockSessionId,
      tmuxSessionName: 'tmux-feature',
    }
    mockBootstrapOriginalCwd = '/repo/.ncode/worktrees/feature'
    mockBootstrapProjectRoot = '/repo-root'

    const result = await ExitWorktreeTool.call!(
      { action: 'keep' },
      {} as never,
      async (_tool, input) => ({
        behavior: 'allow',
        updatedInput: input,
      }),
      {} as never,
    )

    expect(worktreeCalls.keepWorktree).toBe(1)
    expect(worktreeCalls.cleanupWorktree).toBe(0)
    expect(worktreeCalls.setCwd).toEqual(['/repo'])
    expect(worktreeCalls.setOriginalCwd).toEqual(['/repo'])
    expect(worktreeCalls.saveWorktreeState).toEqual([null])
    expect(result.data).toMatchObject({
      action: 'keep',
      originalCwd: '/repo',
      worktreePath: '/repo/.ncode/worktrees/feature',
      worktreeBranch: 'worktree-feature',
      tmuxSessionName: 'tmux-feature',
    })
    expect(result.data.message).toContain('Your work is preserved')
    expect(result.data.message).toContain('tmux attach -t tmux-feature')
    expect(analyticsEvents).toEqual([
      {
        name: 'ncode_worktree_kept',
        metadata: { mid_session: true, commits: 0, changed_files: 0 },
      },
    ])
  })

  it('removes a worktree, kills tmux, and reports discarded work', async () => {
    mockCurrentWorktreeSession = {
      originalCwd: '/repo',
      worktreePath: '/repo/.ncode/worktrees/feature',
      worktreeName: 'feature',
      worktreeBranch: 'worktree-feature',
      originalHeadCommit: 'abc123',
      sessionId: mockSessionId,
      tmuxSessionName: 'tmux-feature',
    }
    mockBootstrapOriginalCwd = '/repo/.ncode/worktrees/feature'
    mockBootstrapProjectRoot = '/repo-root'
    mockStatusStdout = ' M src/app.ts\n?? notes.txt\n'
    mockRevListStdout = '1\n'

    const result = await ExitWorktreeTool.call!(
      { action: 'remove', discard_changes: true },
      {} as never,
      async (_tool, input) => ({
        behavior: 'allow',
        updatedInput: input,
      }),
      {} as never,
    )

    expect(worktreeCalls.killTmuxSession).toEqual(['tmux-feature'])
    expect(worktreeCalls.cleanupWorktree).toBe(1)
    expect(worktreeCalls.keepWorktree).toBe(0)
    expect(worktreeCalls.setCwd).toEqual(['/repo'])
    expect(worktreeCalls.setOriginalCwd).toEqual(['/repo'])
    expect(result.data).toMatchObject({
      action: 'remove',
      originalCwd: '/repo',
      worktreePath: '/repo/.ncode/worktrees/feature',
      discardedFiles: 2,
      discardedCommits: 1,
    })
    expect(result.data.message).toContain('Discarded 1 commit and 2 uncommitted files')
    expect(analyticsEvents).toEqual([
      {
        name: 'ncode_worktree_removed',
        metadata: { mid_session: true, commits: 1, changed_files: 2 },
      },
    ])
  })
})
