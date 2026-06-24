import { beforeEach, describe, expect, it, mock } from 'bun:test'

let eligibility = { eligible: true, errors: [] as string[] }
let mockSession: { id: string; title?: string } | null = {
  id: 'remote-session',
  title: 'Draft PR',
}
let registeredTask = {
  taskId: 'task-123',
  sessionId: 'sess-123',
}

const remoteTaskPaths = [
  import.meta.resolve('../../tasks/RemoteAgentTask/RemoteAgentTask.ts'),
  import.meta.resolve('../../tasks/RemoteAgentTask/RemoteAgentTask.js'),
]
const diskOutputPaths = [
  import.meta.resolve('../../utils/task/diskOutput.ts'),
  import.meta.resolve('../../utils/task/diskOutput.js'),
]
const teleportPaths = [
  import.meta.resolve('../../utils/teleport.tsx'),
  import.meta.resolve('../../utils/teleport.js'),
]

for (const remoteTaskPath of remoteTaskPaths) {
  mock.module(remoteTaskPath, () => ({
    checkRemoteAgentEligibility: async () => eligibility,
    formatPreconditionError: (error: string) => `formatted:${error}`,
    getRemoteTaskSessionUrl: (sessionId: string) => `https://remote/${sessionId}`,
    registerRemoteAgentTask: () => registeredTask,
  }))
}

for (const diskOutputPath of diskOutputPaths) {
  mock.module(diskOutputPath, () => ({
    getTaskOutputPath: (taskId: string) => `/tmp/${taskId}.log`,
  }))
}

for (const teleportPath of teleportPaths) {
  mock.module(teleportPath, () => ({
    teleportToRemote: async () => mockSession,
  }))
}

const { SuggestBackgroundPRTool } = await import(
  import.meta.resolve('./SuggestBackgroundPRTool.ts'),
)

beforeEach(() => {
  eligibility = { eligible: true, errors: [] }
  mockSession = {
    id: 'remote-session',
    title: 'Draft PR',
  }
  registeredTask = {
    taskId: 'task-123',
    sessionId: 'sess-123',
  }
})

describe('SuggestBackgroundPRTool runtime contract', () => {
  it('launches a remote PR task and returns the remote metadata', async () => {
    const result = await SuggestBackgroundPRTool.call!(
      {
        description: 'Draft the PR',
        prompt: 'Open a PR with the current changes',
      },
      {
        abortController: new AbortController(),
        toolUseId: 'toolu_bgpr',
      } as never,
    )

    expect(result.data).toEqual({
      status: 'remote_launched',
      taskId: 'task-123',
      sessionUrl: 'https://remote/sess-123',
      description: 'Draft the PR',
      prompt: 'Open a PR with the current changes',
      outputFile: '/tmp/task-123.log',
    })
  })

  it('fails with formatted eligibility errors when remote launch is unavailable', async () => {
    eligibility = {
      eligible: false,
      errors: ['no bundle support'],
    }

    await expect(
      SuggestBackgroundPRTool.call!(
        {
          description: 'Draft the PR',
          prompt: 'Open a PR with the current changes',
        },
        {
          abortController: new AbortController(),
          toolUseId: 'toolu_bgpr',
        } as never,
      ),
    ).rejects.toThrow(
      'Cannot launch background PR task:\nformatted:no bundle support',
    )
  })
})
