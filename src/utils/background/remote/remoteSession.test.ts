import { beforeEach, describe, expect, it, mock } from 'bun:test'

const state = {
  policyAllowed: true,
  needsLogin: false,
  hasRemoteEnv: true,
  inGitRepo: false,
  bundleSeedGateOn: false,
  repository: null as
    | { host: string; owner: string; name: string }
    | null,
  workspaceSource: null as
    | {
        type: 'noumena_workspace'
        workspace_id: string
        repo: string
        raw_workspace_name: string
        checkout_path: string
      }
    | null,
  githubAppInstalled: true,
}

const growthbookPaths = [
  import.meta.resolve('../../../services/analytics/growthbook.ts'),
  import.meta.resolve('../../../services/analytics/growthbook.js'),
]
const policyPaths = [
  import.meta.resolve('../../../services/policyLimits/index.ts'),
  import.meta.resolve('../../../services/policyLimits/index.js'),
]
const preconditionPaths = [
  import.meta.resolve('./preconditions.ts'),
  import.meta.resolve('./preconditions.js'),
]
const detectRepositoryPaths = [
  import.meta.resolve('../../detectRepository.ts'),
  import.meta.resolve('../../detectRepository.js'),
]
const workspaceSourcePaths = [
  import.meta.resolve('../../citcWorkspaceSource.ts'),
  import.meta.resolve('../../citcWorkspaceSource.js'),
]

for (const growthbookPath of growthbookPaths) {
  mock.module(growthbookPath, () => ({
    async checkGate_CACHED_OR_BLOCKING() {
      return state.bundleSeedGateOn
    },
  }))
}

for (const policyPath of policyPaths) {
  mock.module(policyPath, () => ({
    isPolicyAllowed() {
      return state.policyAllowed
    },
  }))
}

for (const preconditionPath of preconditionPaths) {
  mock.module(preconditionPath, () => ({
    async checkNeedsClaudeAiLogin() {
      return state.needsLogin
    },
    async checkHasRemoteEnvironment() {
      return state.hasRemoteEnv
    },
    checkIsInGitRepo() {
      return state.inGitRepo
    },
    async checkGithubAppInstalled() {
      return state.githubAppInstalled
    },
  }))
}

for (const detectRepositoryPath of detectRepositoryPaths) {
  mock.module(detectRepositoryPath, () => ({
    async detectCurrentRepositoryWithHost() {
      return state.repository
    },
  }))
}

for (const workspaceSourcePath of workspaceSourcePaths) {
  mock.module(workspaceSourcePath, () => ({
    async detectCurrentCitcWorkspaceSource() {
      return state.workspaceSource
    },
  }))
}

const remoteSessionModule = await import(import.meta.resolve('./remoteSession.ts'))
const { checkBackgroundRemoteSessionEligibility } = remoteSessionModule

function makeWorkspaceSource() {
  return {
    type: 'noumena_workspace' as const,
    workspace_id: 'workspace-1',
    repo: 'noumena/ncode',
    raw_workspace_name: 'user/xjdr/ncode.dev',
    checkout_path: '/mlstore/src/noumena/ncode.dev',
  }
}

beforeEach(() => {
  state.policyAllowed = true
  state.needsLogin = false
  state.hasRemoteEnv = true
  state.inGitRepo = false
  state.bundleSeedGateOn = false
  state.repository = null
  state.workspaceSource = null
  state.githubAppInstalled = true
  delete process.env.CCR_FORCE_BUNDLE
  delete process.env.CCR_ENABLE_BUNDLE
})

describe('checkBackgroundRemoteSessionEligibility', () => {
  it('allows generic remote sessions from a managed workspace without git state', async () => {
    state.workspaceSource = makeWorkspaceSource()

    await expect(checkBackgroundRemoteSessionEligibility()).resolves.toEqual([])
  })

  it('bypasses GitHub app checks for generic workspace-backed remote sessions', async () => {
    state.inGitRepo = true
    state.repository = {
      host: 'github.com',
      owner: 'noumena',
      name: 'ncode',
    }
    state.workspaceSource = makeWorkspaceSource()
    state.githubAppInstalled = false

    await expect(checkBackgroundRemoteSessionEligibility()).resolves.toEqual([])
  })

  it('still requires a git remote for workflows that must push back to git', async () => {
    state.inGitRepo = true
    state.workspaceSource = makeWorkspaceSource()

    await expect(
      checkBackgroundRemoteSessionEligibility({ requireGitRemote: true }),
    ).resolves.toEqual([{ type: 'no_git_remote' }])
  })

  it('still checks GitHub app access for push-oriented workflows', async () => {
    state.inGitRepo = true
    state.repository = {
      host: 'github.com',
      owner: 'noumena',
      name: 'ncode',
    }
    state.workspaceSource = makeWorkspaceSource()
    state.githubAppInstalled = false

    await expect(
      checkBackgroundRemoteSessionEligibility({ requireGitRemote: true }),
    ).resolves.toEqual([{ type: 'github_app_not_installed' }])
  })
})
