import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { getDefaultAppState } from '../../state/AppStateStore.js'
import type { Command } from '../../types/command.js'
import { createUserMessage } from '../../utils/messages.js'
import { COMMAND_MESSAGE_TAG } from '../../constants/xml.js'
import { SKILL_TOOL_NAME } from './constants.js'

const bootstrapStatePaths = [
  import.meta.resolve('../../bootstrap/state.ts'),
  import.meta.resolve('../../bootstrap/state.js'),
  import.meta.resolve('src/bootstrap/state.js'),
]
const commandsPaths = [
  import.meta.resolve('../../commands.ts'),
  import.meta.resolve('../../commands.js'),
  import.meta.resolve('src/commands.js'),
]
const processSlashCommandPaths = [
  import.meta.resolve('../../utils/processUserInput/processSlashCommand.tsx'),
  import.meta.resolve('../../utils/processUserInput/processSlashCommand.js'),
  import.meta.resolve('src/utils/processUserInput/processSlashCommand.js'),
]
const debugPaths = [
  import.meta.resolve('../../utils/debug.ts'),
  import.meta.resolve('../../utils/debug.js'),
  import.meta.resolve('src/utils/debug.js'),
]
const modelPaths = [
  import.meta.resolve('../../utils/model/model.ts'),
  import.meta.resolve('../../utils/model/model.js'),
  import.meta.resolve('src/utils/model/model.js'),
]
const skillUsagePaths = [
  import.meta.resolve('../../utils/suggestions/skillUsageTracking.ts'),
  import.meta.resolve('../../utils/suggestions/skillUsageTracking.js'),
  import.meta.resolve('src/utils/suggestions/skillUsageTracking.js'),
]
const analyticsPaths = [
  import.meta.resolve('../../services/analytics/index.ts'),
  import.meta.resolve('../../services/analytics/index.js'),
]
const toolUtilsPaths = [
  import.meta.resolve('../utils.ts'),
  import.meta.resolve('../utils.js'),
]
const forkedAgentPaths = [
  import.meta.resolve('../../utils/forkedAgent.ts'),
  import.meta.resolve('../../utils/forkedAgent.js'),
]
const runAgentPaths = [
  import.meta.resolve('../AgentTool/runAgent.ts'),
  import.meta.resolve('../AgentTool/runAgent.js'),
]

let mockCommands: Command[] = []
let recordedSkillUsages: string[] = []
let skillEvents: Array<{ name: string; payload: Record<string, unknown> }> = []
let processedMessages: unknown[] = []
let processedAllowedTools: string[] | undefined
let processedModel: string | undefined

function findMockCommand(name: string): Command | undefined {
  return mockCommands.find(command => command.name === name)
}

for (const bootstrapStatePath of bootstrapStatePaths) {
  mock.module(bootstrapStatePath, () => ({
    getProjectRoot: () => '/repo',
    addInvokedSkill() {},
    clearInvokedSkillsForAgent() {},
    getSessionId: () => 'session-test',
  }))
}

for (const commandsPath of commandsPaths) {
  mock.module(commandsPath, () => ({
    builtInCommandNames: () => new Set<string>(),
    findCommand: (name: string, commands: Command[]) =>
      commands.find(command => command.name === name),
    getCommands: async () => mockCommands,
  }))
}

for (const processSlashCommandPath of processSlashCommandPaths) {
  mock.module(processSlashCommandPath, () => ({
    processPromptSlashCommand: async () => ({
      shouldQuery: true,
      allowedTools: processedAllowedTools,
      model: processedModel,
      messages: processedMessages,
    }),
  }))
}

for (const debugPath of debugPaths) {
  mock.module(debugPath, () => ({
    logForDebugging() {},
  }))
}

for (const modelPath of modelPaths) {
  mock.module(modelPath, () => ({
    resolveSkillModelOverride: (model: string, base: string) =>
      `resolved:${model}:${base}`,
  }))
}

for (const skillUsagePath of skillUsagePaths) {
  mock.module(skillUsagePath, () => ({
    recordSkillUsage(name: string) {
      recordedSkillUsages.push(name)
    },
  }))
}

for (const analyticsPath of analyticsPaths) {
  mock.module(analyticsPath, () => ({
    logEvent(name: string, payload: Record<string, unknown>) {
      skillEvents.push({ name, payload })
    },
  }))
}

for (const toolUtilsPath of toolUtilsPaths) {
  mock.module(toolUtilsPath, () => ({
    getToolUseIDFromParentMessage: () => 'toolu_parent_skill',
    tagMessagesWithToolUseID: (messages: unknown[]) => messages,
  }))
}

for (const forkedAgentPath of forkedAgentPaths) {
  mock.module(forkedAgentPath, () => ({
    extractResultText: () => 'forked result',
    prepareForkedCommandContext: async () => ({
      modifiedGetAppState: () => getDefaultAppState(),
      baseAgent: {
        agentType: 'general-purpose',
      },
      promptMessages: [],
      skillContent: 'skill content',
    }),
  }))
}

for (const runAgentPath of runAgentPaths) {
  mock.module(runAgentPath, () => ({
    runAgent: async function* () {
      yield* []
    },
  }))
}

const { SkillTool } = await import(import.meta.resolve('./SkillTool.ts'))

function createPromptCommand(
  overrides: Partial<Extract<Command, { type: 'prompt' }>> = {},
): Extract<Command, { type: 'prompt' }> {
  return {
    type: 'prompt',
    name: 'review-pr',
    description: 'Review a pull request',
    progressMessage: 'Reviewing',
    contentLength: 16,
    source: 'skills',
    getPromptForCommand: async () => [],
    ...overrides,
  }
}

function createToolUseContext(
  permissionOverrides?: Partial<
    ReturnType<typeof getDefaultAppState>['toolPermissionContext']
  >,
) {
  let appState = getDefaultAppState()
  appState = {
    ...appState,
    toolPermissionContext: {
      ...appState.toolPermissionContext,
      ...permissionOverrides,
    },
  }

  const setAppState = (updater: (prev: typeof appState) => typeof appState) => {
    appState = updater(appState)
  }

  return {
    options: {
      commands: [],
      debug: false,
      mainLoopModel: '/data/models/hf/moonshotai__Kimi-K2.7-Code',
      tools: [SkillTool] as never,
      verbose: false,
      thinkingConfig: {} as never,
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: true,
      agentDefinitions: {
        activeAgents: [],
        allAgents: [],
      },
    },
    abortController: new AbortController(),
    readFileState: {} as never,
    getAppState: () => appState,
    setAppState,
    setAppStateForTasks: setAppState,
    setInProgressToolUseIDs: () => {},
    setResponseLength: () => {},
    updateFileHistoryState: () => {},
    updateAttributionState: () => {},
    messages: [],
  } as never
}

beforeEach(() => {
  mockCommands = []
  recordedSkillUsages = []
  skillEvents = []
  processedAllowedTools = undefined
  processedModel = undefined
  processedMessages = []
})

describe('SkillTool runtime contract', () => {
  it('validates known prompt skills and normalizes a leading slash', async () => {
    mockCommands = [createPromptCommand()]

    const result = await SkillTool.validateInput!(
      { skill: '/review-pr' },
      createToolUseContext(),
    )

    expect(result).toEqual({ result: true })
    expect(skillEvents).toContainEqual({
      name: 'ncode_skill_tool_slash_prefix',
      payload: {},
    })
  })

  it('rejects skills that disable model invocation', async () => {
    mockCommands = [
      createPromptCommand({
        name: 'private-skill',
        disableModelInvocation: true,
      }),
    ]

    const result = await SkillTool.validateInput!(
      { skill: 'private-skill' },
      createToolUseContext(),
    )

    expect(result).toEqual({
      result: false,
      message: `Skill private-skill cannot be used with ${SKILL_TOOL_NAME} tool due to disable-model-invocation`,
      errorCode: 4,
    })
  })

  it('honors deny rules for normalized skill names', async () => {
    mockCommands = [createPromptCommand()]

    const decision = await SkillTool.checkPermissions!(
      { skill: '/review-pr', args: '123' },
      createToolUseContext({
        alwaysDenyRules: {
          localSettings: [`${SKILL_TOOL_NAME}(review-pr)`],
        },
      }),
    )

    expect(decision.behavior).toBe('deny')
    expect(decision.message).toBe('Skill execution blocked by permission rules')
    expect(decision.decisionReason).toMatchObject({
      type: 'rule',
      rule: {
        ruleBehavior: 'deny',
        source: 'localSettings',
        ruleValue: {
          toolName: SKILL_TOOL_NAME,
          ruleContent: 'review-pr',
        },
      },
    })
  })

  it('asks permission for unsafe skills and suggests exact and prefix rules', async () => {
    mockCommands = [
      createPromptCommand({
        hooks: {
          PreToolUse: [],
        } as never,
      }),
    ]

    const decision = await SkillTool.checkPermissions!(
      { skill: 'review-pr', args: '123' },
      createToolUseContext(),
    )

    expect(decision).toEqual({
      behavior: 'ask',
      message: 'Execute skill: review-pr',
      decisionReason: undefined,
      suggestions: [
        {
          type: 'addRules',
          rules: [
            {
              toolName: SKILL_TOOL_NAME,
              ruleContent: 'review-pr',
            },
          ],
          behavior: 'allow',
          destination: 'localSettings',
        },
        {
          type: 'addRules',
          rules: [
            {
              toolName: SKILL_TOOL_NAME,
              ruleContent: 'review-pr:*',
            },
          ],
          behavior: 'allow',
          destination: 'localSettings',
        },
      ],
      updatedInput: { skill: 'review-pr', args: '123' },
      metadata: {
        command: mockCommands[0],
      },
    })
  })

  it('returns inline skill messages and context modifiers for allowed tools, model, and effort', async () => {
    mockCommands = [
      createPromptCommand({
        effort: 'high',
      }),
    ]
    processedAllowedTools = ['Bash', 'Read']
    processedModel = 'opus'
    processedMessages = [
      { type: 'progress', data: { text: 'loading' } },
      createUserMessage({
        content: `<${COMMAND_MESSAGE_TAG}>review-pr</${COMMAND_MESSAGE_TAG}>`,
      }),
      createUserMessage({
        content: 'Use Bash and Read to inspect the diff.',
        isMeta: true,
      }),
    ]

    const toolUseContext = createToolUseContext()
    const result = await SkillTool.call!(
      {
        skill: 'review-pr',
        args: '123',
      },
      toolUseContext,
      async () => ({
        behavior: 'allow',
      }),
      {} as never,
    )

    expect(result.data).toEqual({
      success: true,
      commandName: 'review-pr',
      allowedTools: ['Bash', 'Read'],
      model: 'opus',
    })
    expect(recordedSkillUsages).toEqual(['review-pr'])
    expect(result.newMessages).toHaveLength(1)
    expect(result.newMessages?.[0]).toMatchObject({
      type: 'user',
    })

    const modifiedContext = result.contextModifier!(toolUseContext)
    expect(
      modifiedContext.getAppState().toolPermissionContext.alwaysAllowRules.command,
    ).toEqual(['Bash', 'Read'])
    expect(modifiedContext.options.mainLoopModel).toBe(
      'resolved:opus:/data/models/hf/moonshotai__Kimi-K2.7-Code',
    )
    expect(modifiedContext.getAppState().effortValue).toBe('high')
  })
})
