import { beforeEach, describe, expect, it, mock } from 'bun:test'

const execCalls: Array<{ exe: string; args: string[] }> = []
const eligibilityCalls: Array<{
  skipBundle?: boolean
  requireGitRemote?: boolean
}> = []
const teleportCalls: any[] = []
const registerCalls: any[] = []

let ghViewResult = {
  code: 0,
  stdout: JSON.stringify({
    number: 321,
    url: 'https://github.com/noumena/ncode/pull/321',
    headRefName: 'xjdr/fix-pr',
    headRepository: { name: 'ncode' },
    headRepositoryOwner: { login: 'noumena' },
    state: 'OPEN',
  }),
}

let eligibilityResult: any = { eligible: true }
let teleportResult: any = {
  id: 'session-123',
  title: 'Autofix PR',
}
let registerResult = {
  taskId: 'task-123',
  sessionId: 'session-123',
  cleanup() {},
}

const execPaths = [
  import.meta.resolve('../../utils/execFileNoThrow.ts'),
  import.meta.resolve('../../utils/execFileNoThrow.js'),
]
const remoteTaskPaths = [
  import.meta.resolve('../../tasks/RemoteAgentTask/RemoteAgentTask.tsx'),
  import.meta.resolve('../../tasks/RemoteAgentTask/RemoteAgentTask.js'),
]
const teleportPaths = [
  import.meta.resolve('../../utils/teleport.tsx'),
  import.meta.resolve('../../utils/teleport.js'),
]
const diskOutputPaths = [
  import.meta.resolve('../../utils/task/diskOutput.ts'),
  import.meta.resolve('../../utils/task/diskOutput.js'),
]

const actualExec = await import(import.meta.resolve('../../utils/execFileNoThrow.ts'))
const actualRemoteTask = await import(
  import.meta.resolve('../../tasks/RemoteAgentTask/RemoteAgentTask.tsx')
)
const actualTeleport = await import(import.meta.resolve('../../utils/teleport.tsx'))
const actualDiskOutput = await import(
  import.meta.resolve('../../utils/task/diskOutput.ts')
)

for (const execPath of execPaths) {
  mock.module(execPath, () => ({
    ...actualExec,
    async execFileNoThrow(exe: string, args: string[]) {
      execCalls.push({ exe, args })
      return ghViewResult
    },
  }))
}

for (const remoteTaskPath of remoteTaskPaths) {
  mock.module(remoteTaskPath, () => ({
    ...actualRemoteTask,
    async checkRemoteAgentEligibility(options?: {
      skipBundle?: boolean
      requireGitRemote?: boolean
    }) {
      eligibilityCalls.push(options ?? {})
      return eligibilityResult
    },
    registerRemoteAgentTask(options: any) {
      registerCalls.push(options)
      return registerResult
    },
  }))
}

for (const teleportPath of teleportPaths) {
  mock.module(teleportPath, () => ({
    ...actualTeleport,
    async teleportToRemote(options: any) {
      teleportCalls.push(options)
      return teleportResult
    },
  }))
}

for (const diskOutputPath of diskOutputPaths) {
  mock.module(diskOutputPath, () => ({
    ...actualDiskOutput,
    getTaskOutputPath(taskId: string) {
      return `/tmp/${taskId}.log`
    },
  }))
}

const autofixModule = await import(import.meta.resolve('./autofix-pr.ts'))
const { buildAutofixPrPrompt, detectCurrentAutofixPr, launchAutofixPr, call } =
  autofixModule

beforeEach(() => {
  execCalls.length = 0
  eligibilityCalls.length = 0
  teleportCalls.length = 0
  registerCalls.length = 0
  ghViewResult = {
    code: 0,
    stdout: JSON.stringify({
      number: 321,
      url: 'https://github.com/noumena/ncode/pull/321',
      headRefName: 'xjdr/fix-pr',
      headRepository: { name: 'ncode' },
      headRepositoryOwner: { login: 'noumena' },
      state: 'OPEN',
    }),
  }
  eligibilityResult = { eligible: true }
  teleportResult = { id: 'session-123', title: 'Autofix PR' }
  registerResult = {
    taskId: 'task-123',
    sessionId: 'session-123',
    cleanup() {},
  }
})

describe('/autofix-pr detection', () => {
  it('parses the current PR from gh output', async () => {
    await expect(detectCurrentAutofixPr()).resolves.toEqual({
      owner: 'noumena',
      repo: 'ncode',
      number: 321,
      url: 'https://github.com/noumena/ncode/pull/321',
      headRefName: 'xjdr/fix-pr',
    })
    expect(execCalls).toEqual([
      {
        exe: 'gh',
        args: ['pr', 'view', '--json', expect.any(String) as never],
      },
    ])
  })

  it('treats merged or closed PRs as missing', async () => {
    ghViewResult = {
      code: 0,
      stdout: JSON.stringify({
        number: 321,
        url: 'https://github.com/noumena/ncode/pull/321',
        headRefName: 'xjdr/fix-pr',
        headRepository: { nameWithOwner: 'noumena/ncode' },
        headRepositoryOwner: { login: 'noumena' },
        state: 'MERGED',
      }),
    }
    await expect(detectCurrentAutofixPr()).resolves.toBeNull()
  })
})

describe('/autofix-pr launch', () => {
  it('launches a long-running remote autofix task on the current PR branch', async () => {
    const launched = await launchAutofixPr('only touch flaky tests', {
      abortController: new AbortController(),
      setAppState() {},
      toolUseId: 'toolu_123',
    } as never)

    expect(eligibilityCalls).toEqual([
      { skipBundle: true, requireGitRemote: true },
    ])
    expect(teleportCalls).toHaveLength(1)
    expect(teleportCalls[0]).toMatchObject({
      description: 'autofix-pr: noumena/ncode#321',
      branchName: 'xjdr/fix-pr',
      skipBundle: true,
      reuseOutcomeBranch: 'xjdr/fix-pr',
      githubPr: {
        owner: 'noumena',
        repo: 'ncode',
        number: 321,
      },
    })
    expect(teleportCalls[0].initialMessage).toContain(
      'Additional instructions from user:\nonly touch flaky tests',
    )

    expect(registerCalls).toEqual([
      expect.objectContaining({
        remoteTaskType: 'autofix-pr',
        command: '/autofix-pr only touch flaky tests',
        isLongRunning: true,
        remoteTaskMetadata: {
          owner: 'noumena',
          repo: 'ncode',
          prNumber: 321,
        },
      }),
    ])

    expect(launched).toMatchObject({
      taskId: 'task-123',
      sessionUrl: expect.stringContaining('session-123'),
      outputFile: '/tmp/task-123.log',
      target: {
        owner: 'noumena',
        repo: 'ncode',
        number: 321,
      },
    })
  })

  it('returns a system failure when no PR is found', async () => {
    ghViewResult = { code: 1, stdout: '' }

    const doneCalls: any[] = []
    const result = await call(
      (message, options) => {
        doneCalls.push({ message, options })
      },
      {
        abortController: new AbortController(),
        setAppState() {},
        toolUseId: 'toolu_123',
      } as never,
      '',
    )

    expect(result).toBeNull()
    expect(doneCalls).toEqual([
      {
        message: expect.stringContaining(
          'No open pull request is associated with the current branch.',
        ),
        options: { display: 'system' },
      },
    ])
  })
})

describe('/autofix-pr prompt', () => {
  it('builds a long-running monitor prompt over the PR head branch', () => {
    const prompt = buildAutofixPrPrompt({
      owner: 'noumena',
      repo: 'ncode',
      number: 321,
      url: 'https://github.com/noumena/ncode/pull/321',
      headRefName: 'xjdr/fix-pr',
    })

    expect(prompt).toContain('noumena/ncode#321')
    expect(prompt).toContain('xjdr/fix-pr')
    expect(prompt).toContain('Continuously monitor the PR')
    expect(prompt).toContain('Do not create a new branch or a new pull request.')
  })
})
