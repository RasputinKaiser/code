import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

const gitPaths = [
  import.meta.resolve('../utils/git.js'),
  import.meta.resolve('../utils/git.ts'),
]
const promptShellPaths = [
  import.meta.resolve('../utils/promptShellExecution.js'),
  import.meta.resolve('../utils/promptShellExecution.ts'),
]
const attributionPaths = [
  import.meta.resolve('../utils/attribution.js'),
  import.meta.resolve('../utils/attribution.ts'),
]
const undercoverPaths = [
  import.meta.resolve('../utils/undercover.js'),
  import.meta.resolve('../utils/undercover.ts'),
]

let mockIsGit = false
let mockIsSl = false
let mockDefaultBranch = 'main'

let mockPromptContent = ''

for (const gitPath of gitPaths) {
  mock.module(gitPath, () => ({
    getIsGit: async () => mockIsGit,
    getIsSl: async () => mockIsSl,
    getDefaultBranch: async () => mockDefaultBranch,
    dirIsInGitRepo: async () => false,
    findCanonicalGitRoot: async () => null,
    findGitRoot: async () => null,
    gitExe: () => 'git',
    getGitDir: async () => null,
    isAtGitRoot: async () => false,
    getHead: async () => '',
    getBranch: async () => '',
    getRemoteUrl: async () => null,
    normalizeGitRemoteUrl: () => null,
    getRepoRemoteHash: async () => null,
    getIsHeadOnRemote: async () => false,
    hasUnpushedCommits: async () => false,
    getIsClean: async () => true,
    getChangedFiles: async () => [],
    getFileStatus: async () => ({}),
    getWorktreeCount: async () => 1,
    stashToCleanState: async () => false,
    getGitState: async () => null,
    getGithubRepo: async () => null,
    findRemoteBase: async () => null,
    preserveGitStateForIssue: async () => null,
    isCurrentDirectoryBareGitRepo: () => false,
  }))
}

for (const promptShellPath of promptShellPaths) {
  mock.module(promptShellPath, () => ({
    executeShellCommandsInPrompt: async (text: string) => {
      mockPromptContent = text
      return text
    },
  }))
}

for (const attributionPath of attributionPaths) {
  mock.module(attributionPath, () => ({
    getAttributionTexts: () => ({ commit: '', pr: '' }),
    getEnhancedPRAttribution: async () => null,
  }))
}

for (const undercoverPath of undercoverPaths) {
  mock.module(undercoverPath, () => ({
    isUndercover: () => false,
    getUndercoverInstructions: () => '',
  }))
}

const commitCommand = await import('./commit.js')
const commitPushPrCommand = await import('./commit-push-pr.js')

// biome-ignore-all assist/source/organizeImports: bun:test must be top level
function createMockContext() {
  return {
    abortController: new AbortController(),
    // biome-ignore-next-line @typescript-eslint/no-empty-function
    readFileState: { get: () => undefined },
    getAppState: () => ({
      toolPermissionContext: {
        mode: 'default',
        alwaysAllowRules: {},
        sessionApprovedTools: new Set(),
        explicitDenials: [],
        // biome-ignore-next-line @typescript-eslint/no-empty-function
        trackDenial: () => {},
        sessionApprovedCommands: new Set(),
        commandFingerprintToToolName: new Map(),
      },
    }),
    // biome-ignore-next-line @typescript-eslint/no-empty-function
    setAppState: () => {},
  } as never
}

describe('/commit command', () => {
  beforeEach(() => {
    mockIsGit = false
    mockIsSl = false
    mockPromptContent = ''
  })

  it('has correct metadata', () => {
    expect(commitCommand.default).toMatchObject({
      type: 'prompt',
      name: 'commit',
      description: 'Create a commit',
      progressMessage: 'creating commit',
      source: 'builtin',
    })
  })

  it('allows both git and sl tools', () => {
    const allowed = commitCommand.default.allowedTools as string[]
    expect(allowed).toContain('Bash(git add:*)')
    expect(allowed).toContain('Bash(git status:*)')
    expect(allowed).toContain('Bash(git diff:*)')
    expect(allowed).toContain('Bash(git branch:*)')
    expect(allowed).toContain('Bash(git log:*)')
    expect(allowed).toContain('Bash(git commit:*)')
    expect(allowed).toContain('Bash(sl add:*)')
    expect(allowed).toContain('Bash(sl status:*)')
    expect(allowed).toContain('Bash(sl diff:*)')
    expect(allowed).toContain('Bash(sl book:*)')
    expect(allowed).toContain('Bash(sl smartlog:*)')
    expect(allowed).toContain('Bash(sl log:*)')
    expect(allowed).toContain('Bash(sl commit:*)')
  })

  it('generates git prompt for git repo', async () => {
    mockIsGit = true
    mockIsSl = false

    await commitCommand.default.getPromptForCommand('', createMockContext())
    expect(mockPromptContent).toContain('git status')
    expect(mockPromptContent).toContain('git diff HEAD')
    expect(mockPromptContent).toContain('git branch --show-current')
    expect(mockPromptContent).toContain('git log --oneline -10')
    expect(mockPromptContent).toContain('git commit')
    expect(mockPromptContent).toContain('Git Safety Protocol')
    expect(mockPromptContent).not.toContain('sl status')
  })

  it('generates sl prompt for sl repo', async () => {
    mockIsGit = false
    mockIsSl = true

    await commitCommand.default.getPromptForCommand('', createMockContext())
    expect(mockPromptContent).toContain('sl status')
    expect(mockPromptContent).toContain('sl diff')
    expect(mockPromptContent).toContain('sl book')
    expect(mockPromptContent).toContain('sl smartlog')
    expect(mockPromptContent).toContain(`sl log -l 10 -T '{node|short} {desc|firstline}'`)
    expect(mockPromptContent).toContain('sl commit')
    expect(mockPromptContent).toContain('Sl Safety Protocol')
    expect(mockPromptContent).not.toContain('git status')
  })

  it('defaults to git prompt when neither repo type detected', async () => {
    mockIsGit = false
    mockIsSl = false

    await commitCommand.default.getPromptForCommand('', createMockContext())
    expect(mockPromptContent).toContain('git status')
    expect(mockPromptContent).toContain('Git Safety Protocol')
    expect(mockPromptContent).not.toContain('Sl Safety Protocol')
  })
})

describe('/commit-push-pr command', () => {
  beforeEach(() => {
    mockIsGit = false
    mockIsSl = false
    mockDefaultBranch = 'main'
    mockPromptContent = ''
  })

  it('has correct metadata', () => {
    expect(commitPushPrCommand.default).toMatchObject({
      type: 'prompt',
      name: 'commit-push-pr',
      description: 'Commit, push, and open a PR',
      progressMessage: 'creating commit and PR',
      source: 'builtin',
    })
  })

  it('allows both git and sl tools', () => {
    const allowed = commitPushPrCommand.default.allowedTools as string[]
    expect(allowed).toContain('Bash(git add:*)')
    expect(allowed).toContain('Bash(git status:*)')
    expect(allowed).toContain('Bash(git diff:*)')
    expect(allowed).toContain('Bash(git branch:*)')
    expect(allowed).toContain('Bash(git commit:*)')
    expect(allowed).toContain('Bash(sl add:*)')
    expect(allowed).toContain('Bash(sl status:*)')
    expect(allowed).toContain('Bash(sl diff:*)')
    expect(allowed).toContain('Bash(sl log:*)')
    expect(allowed).toContain('Bash(sl smartlog:*)')
    expect(allowed).toContain('Bash(sl commit:*)')
    expect(allowed).toContain('Bash(sl push:*)')
    expect(allowed).toContain('Bash(sl book:*)')
    expect(allowed).toContain('Bash(gh pr create:*)')
  })

  it('generates git prompt for git repo', async () => {
    mockIsGit = true
    mockIsSl = false

    await commitPushPrCommand.default.getPromptForCommand('', createMockContext())
    expect(mockPromptContent).toContain('git status')
    expect(mockPromptContent).toContain('git diff HEAD')
    expect(mockPromptContent).toContain('git branch --show-current')
    expect(mockPromptContent).toContain('git diff main...HEAD')
    expect(mockPromptContent).toContain('git commit')
    expect(mockPromptContent).toContain('Push the branch to origin')
    expect(mockPromptContent).toContain('Git Safety Protocol')
    expect(mockPromptContent).not.toContain('sl status')
  })

  it('generates sl prompt for sl repo', async () => {
    mockIsGit = false
    mockIsSl = true
    mockDefaultBranch = 'main'

    await commitPushPrCommand.default.getPromptForCommand('', createMockContext())
    expect(mockPromptContent).toContain('sl status')
    expect(mockPromptContent).toContain('sl diff')
    expect(mockPromptContent).toContain('sl smartlog')
    expect(mockPromptContent).toContain('sl book')
    expect(mockPromptContent).toContain('sl diff -r main')
    expect(mockPromptContent).toContain('sl commit')
    expect(mockPromptContent).toContain('sl push -B')
    expect(mockPromptContent).toContain('Sl Safety Protocol')
    expect(mockPromptContent).not.toContain('git status')
  })

  it('defaults to git prompt when neither repo type detected', async () => {
    mockIsGit = false
    mockIsSl = false

    await commitPushPrCommand.default.getPromptForCommand('', createMockContext())
    expect(mockPromptContent).toContain('git status')
    expect(mockPromptContent).toContain('Git Safety Protocol')
    expect(mockPromptContent).not.toContain('Sl Safety Protocol')
  })
})
