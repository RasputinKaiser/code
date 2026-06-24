import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { _resetForTesting as resetAnalytics } from '../services/analytics/index.js'
import type { Message, UserMessage } from '../types/message.js'
import {
  readTeamFile,
  writeTeamFileAsync,
} from '../utils/swarm/teamHelpers.js'
import {
  clearDynamicTeamContext,
  setDynamicTeamContext,
} from '../utils/teammate.js'
import { createReplOnQuery } from './replTurnController.js'

let configDir = ''
const originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR
const originalUserType = process.env.USER_TYPE

function restoreEnvVar(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
}

async function writeTeamFixture(
  teamName = 'team-alpha',
  memberName = 'agent-beta',
): Promise<void> {
  await writeTeamFileAsync(teamName, {
    name: teamName,
    createdAt: Date.now(),
    leadAgentId: 'lead-agent',
    members: [
      {
        agentId: 'agent-id-beta',
        name: memberName,
        joinedAt: Date.now(),
        tmuxPaneId: 'pane-1',
        cwd: '/repo/worktree',
        subscriptions: [],
      },
    ],
  })
}

function createUserMessage(
  uuid: string,
  content: string,
  options?: { isMeta?: boolean },
): UserMessage {
  return {
    type: 'user',
    uuid,
    isMeta: options?.isMeta ?? false,
    message: {
      content,
    },
  } as unknown as UserMessage
}

function createAssistantMessage(uuid: string): Message {
  return {
    type: 'assistant',
    uuid,
    message: {
      id: `assistant-${uuid}`,
      model: 'gpt-test',
      content: [{ type: 'text', text: 'assistant reply' }],
    },
  } as unknown as Message
}

function createDeps(
  overrides: Partial<ReturnType<typeof createDepsBase>> = {},
) {
  return {
    ...createDepsBase(),
    ...overrides,
  }
}

function createDepsBase() {
  const messagesRef = { current: [] as Message[] }

  return {
    queryGuard: {
      tryStart: () => null,
      end: () => true,
      isActive: () => false,
    },
    enqueuePrompt: () => {},
    setMessages: (action: Message[] | ((prev: Message[]) => Message[])) => {
      messagesRef.current =
        typeof action === 'function' ? action(messagesRef.current) : action
      return messagesRef.current
    },
    messagesRef,
    responseLengthRef: { current: 0 },
    apiMetricsRef: { current: [] },
    setStreamingToolUses: () => {},
    setStreamingText: () => {},
    resetTimingRefs: () => {},
    mrOnBeforeQuery: async () => {},
    runQueryImpl: async () => {},
    finalizeCurrentTurn: async () => {},
    getRestorableCanceledMessage: () => undefined,
    removeLastFromHistory: () => {},
    restoreMessageSync: () => {},
  }
}

async function waitUntil(
  predicate: () => boolean,
  timeoutMs = 200,
): Promise<void> {
  const started = Date.now()
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error('Timed out waiting for condition')
    }
    await Bun.sleep(1)
  }
}

beforeEach(async () => {
  resetAnalytics()
  configDir = await mkdtemp(join(tmpdir(), 'repl-turn-controller-'))
  process.env.CLAUDE_CONFIG_DIR = configDir
  restoreEnvVar('USER_TYPE', originalUserType)
  clearDynamicTeamContext()
})

describe('createReplOnQuery swarm activity semantics', () => {
  it('marks the current agent active only when swarms are enabled and both names are present', async () => {
    const onQuery = createReplOnQuery(createDeps())
    await writeTeamFixture()

    process.env.USER_TYPE = 'ant'
    setDynamicTeamContext({
      agentId: 'agent-id-beta',
      agentName: 'agent-beta',
      teamName: 'team-alpha',
      planModeRequired: false,
    })

    await onQuery([], new AbortController(), true, [], 'gpt-test')

    await waitUntil(
      () => readTeamFile('team-alpha')?.members[0]?.isActive === true,
    )
    expect(readTeamFile('team-alpha')?.members).toMatchObject([
      {
        name: 'agent-beta',
        isActive: true,
      },
    ])
  })

  it('skips member activation when swarms are disabled or identity is incomplete', async () => {
    const onQuery = createReplOnQuery(createDeps())
    await writeTeamFixture()

    await onQuery([], new AbortController(), true, [], 'gpt-test')
    expect(readTeamFile('team-alpha')?.members[0]?.isActive).toBeUndefined()

    process.env.USER_TYPE = 'ant'
    setDynamicTeamContext({
      agentId: 'agent-id-beta',
      agentName: '',
      teamName: 'team-alpha',
      planModeRequired: false,
    })

    await onQuery([], new AbortController(), true, [], 'gpt-test')
    expect(readTeamFile('team-alpha')?.members[0]?.isActive).toBeUndefined()
  })

  it('concurrent turns only enqueue non-meta user prompts and skip execution', async () => {
    const enqueued: string[] = []
    let runQueryImplCalls = 0
    const onQuery = createReplOnQuery(
      createDeps({
        enqueuePrompt: value => {
          enqueued.push(value)
        },
        runQueryImpl: async () => {
          runQueryImplCalls += 1
        },
      }),
    )

    await onQuery(
      [
        createUserMessage('u1', 'real prompt'),
        createUserMessage('u2', 'meta prompt', { isMeta: true }),
        createAssistantMessage('a1'),
      ],
      new AbortController(),
      true,
      [],
      'gpt-test',
    )

    expect(enqueued).toEqual(['real prompt'])
    expect(runQueryImplCalls).toBe(0)
  })

  it('appends new messages before the before-query callbacks and execution', async () => {
    const previousAssistant = createAssistantMessage('a-prev')
    const newUserMessage = createUserMessage('u1', 'new prompt')
    const latestMessageSnapshots: Message[][] = []
    let runQueryImplMessages: Message[] | undefined

    const deps = createDeps({
      queryGuard: {
        tryStart: () => 1,
        end: () => true,
        isActive: () => false,
      },
      messagesRef: { current: [previousAssistant] },
    })
    deps.setMessages = action => {
      deps.messagesRef.current =
        typeof action === 'function' ? action(deps.messagesRef.current) : action
      return deps.messagesRef.current
    }
    deps.mrOnBeforeQuery = async (_input, latestMessages) => {
      latestMessageSnapshots.push([...latestMessages])
    }
    deps.runQueryImpl = async messagesIncludingNewMessages => {
      runQueryImplMessages = [...messagesIncludingNewMessages]
    }

    const onQuery = createReplOnQuery(deps)

    await onQuery(
      [newUserMessage],
      new AbortController(),
      true,
      [],
      'gpt-test',
      async (_input, latestMessages) => {
        latestMessageSnapshots.push([...latestMessages])
        return true
      },
      'new prompt',
    )

    expect(latestMessageSnapshots).toEqual([
      [previousAssistant, newUserMessage],
      [previousAssistant, newUserMessage],
    ])
    expect(runQueryImplMessages).toEqual([previousAssistant, newUserMessage])
  })

  it('restores a canceled user message even when a stale finally loses the guard', async () => {
    let finalizeCalls = 0
    let removeCalls = 0
    const restoredMessages: UserMessage[] = []
    const restorableMessage = createUserMessage('u1', 'restore me')

    const onQuery = createReplOnQuery(
      createDeps({
        queryGuard: {
          tryStart: () => 7,
          end: () => false,
          isActive: () => true,
        },
        runQueryImpl: async () => {},
        finalizeCurrentTurn: async () => {
          finalizeCalls += 1
        },
        getRestorableCanceledMessage: () => restorableMessage,
        removeLastFromHistory: () => {
          removeCalls += 1
        },
        restoreMessageSync: message => {
          restoredMessages.push(message)
        },
      }),
    )

    await onQuery([], new AbortController(), true, [], 'gpt-test')

    expect(finalizeCalls).toBe(0)
    expect(removeCalls).toBe(1)
    expect(restoredMessages).toEqual([restorableMessage])
  })

  it('surfaces query failures as visible messages and does not rethrow', async () => {
    let finalizeCalls = 0
    const deps = createDeps({
      queryGuard: {
        tryStart: () => 11,
        end: () => true,
        isActive: () => false,
      },
      runQueryImpl: async () => {
        throw new Error('executor exploded')
      },
      finalizeCurrentTurn: async () => {
        finalizeCalls += 1
      },
    })
    const onQuery = createReplOnQuery(deps)

    await onQuery([], new AbortController(), true, [], 'gpt-test')

    expect(finalizeCalls).toBe(1)
    const lastMessage = deps.messagesRef.current.at(-1)
    expect(lastMessage?.type).toBe('assistant')
    if (lastMessage?.type !== 'assistant') {
      throw new Error('expected assistant error message')
    }
    expect(lastMessage.isApiErrorMessage).toBe(true)
    expect(lastMessage.message.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('executor exploded'),
    })
  })
})

afterEach(async () => {
  resetAnalytics()
  clearDynamicTeamContext()
  restoreEnvVar('CLAUDE_CONFIG_DIR', originalClaudeConfigDir)
  restoreEnvVar('USER_TYPE', originalUserType)
  await rm(configDir, { recursive: true, force: true })
  configDir = ''
})
