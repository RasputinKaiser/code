import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { existsSync } from 'fs'
import { mkdtemp, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { getDefaultAppState } from '../../state/AppStateStore.js'
import {
  getScheduledTasksEnabled,
  resetStateForTests,
  setOriginalCwd,
  setProjectRoot,
} from '../../bootstrap/state.js'
import {
  createTeammateContext,
  runWithTeammateContext,
} from '../../utils/teammateContext.js'
import { getCronFilePath, listAllCronTasks } from '../../utils/cronTasks.js'

const growthbookPaths = [
  import.meta.resolve('../../services/analytics/growthbook.ts'),
  import.meta.resolve('../../services/analytics/growthbook.js'),
]

for (const growthbookPath of growthbookPaths) {
  mock.module(growthbookPath, () => ({
    getFeatureValue_CACHED_WITH_REFRESH(
      _name: string,
      defaultValue: boolean,
    ) {
      return defaultValue
    },
  }))
}

const { CronCreateTool } = await import('./CronCreateTool.ts')
const { CronDeleteTool } = await import('./CronDeleteTool.ts')
const { CronListTool } = await import('./CronListTool.ts')

function createToolUseContext(
  tools: Array<{ name: string; userFacingName: () => string }>,
) {
  let appState = getDefaultAppState()
  const setAppState = (updater: (prev: typeof appState) => typeof appState) => {
    appState = updater(appState)
  }

  return {
    options: {
      commands: [],
      debug: false,
      mainLoopModel: '/data/models/hf/moonshotai__Kimi-K2.7-Code',
      tools: tools as never,
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

async function allowWithOriginalInput<T>(_tool: unknown, input: T) {
  return {
    behavior: 'allow' as const,
    updatedInput: input,
  }
}

let tempProjectRoot = ''

beforeEach(async () => {
  resetStateForTests()
  tempProjectRoot = await mkdtemp(join(tmpdir(), 'ncode-cron-tools-'))
  setProjectRoot(tempProjectRoot)
  setOriginalCwd(tempProjectRoot)
})

afterEach(async () => {
  resetStateForTests()
  if (tempProjectRoot) {
    await rm(tempProjectRoot, { recursive: true, force: true })
  }
  tempProjectRoot = ''
})

describe('cron tool runtime contract', () => {
  it('creates a session-only cron job, enables the scheduler, and lists it', async () => {
    const toolUseContext = createToolUseContext([CronCreateTool, CronListTool])

    const validation = await CronCreateTool.validateInput!(
      {
        cron: '7 * * * *',
        prompt: 'session smoke task',
      },
      toolUseContext,
    )
    expect(validation).toEqual({ result: true })

    const result = await CronCreateTool.call!(
      {
        cron: '7 * * * *',
        prompt: 'session smoke task',
      },
      toolUseContext,
      allowWithOriginalInput,
      {} as never,
    )

    expect(getScheduledTasksEnabled()).toBe(true)
    expect(existsSync(getCronFilePath(tempProjectRoot))).toBe(false)

    const tasks = await listAllCronTasks()
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({
      id: result.data.id,
      cron: '7 * * * *',
      prompt: 'session smoke task',
      recurring: true,
      durable: false,
    })

    const listed = await CronListTool.call!(
      {},
      toolUseContext,
      allowWithOriginalInput,
      {} as never,
    )
    expect(listed.data.jobs).toEqual([
      expect.objectContaining({
        id: result.data.id,
        cron: '7 * * * *',
        prompt: 'session smoke task',
        recurring: true,
        durable: false,
      }),
    ])
  })

  it('creates a durable cron job on disk and deletes it cleanly', async () => {
    const toolUseContext = createToolUseContext([
      CronCreateTool,
      CronDeleteTool,
      CronListTool,
    ])

    const created = await CronCreateTool.call!(
      {
        cron: '13 9 12 8 *',
        prompt: 'durable smoke task',
        recurring: false,
        durable: true,
      },
      toolUseContext,
      allowWithOriginalInput,
      {} as never,
    )

    const cronFilePath = getCronFilePath(tempProjectRoot)
    expect(existsSync(cronFilePath)).toBe(true)

    const cronFile = JSON.parse(await readFile(cronFilePath, 'utf8'))
    expect(cronFile.tasks).toEqual([
      expect.objectContaining({
        id: created.data.id,
        cron: '13 9 12 8 *',
        prompt: 'durable smoke task',
      }),
    ])

    const listed = await CronListTool.call!(
      {},
      toolUseContext,
      allowWithOriginalInput,
      {} as never,
    )
    expect(listed.data.jobs).toEqual([
      expect.objectContaining({
        id: created.data.id,
        cron: '13 9 12 8 *',
        prompt: 'durable smoke task',
      }),
    ])
    expect(listed.data.jobs[0]?.durable).toBeUndefined()

    const deleteValidation = await CronDeleteTool.validateInput!(
      { id: created.data.id },
      toolUseContext,
    )
    expect(deleteValidation).toEqual({ result: true })

    await CronDeleteTool.call!(
      { id: created.data.id },
      toolUseContext,
      allowWithOriginalInput,
      {} as never,
    )

    const updatedCronFile = JSON.parse(await readFile(cronFilePath, 'utf8'))
    expect(updatedCronFile.tasks).toEqual([])
  })

  it('scopes CronList to the current teammate and rejects deleting another owner job', async () => {
    const toolUseContext = createToolUseContext([
      CronCreateTool,
      CronDeleteTool,
      CronListTool,
    ])
    const teammateContext = createTeammateContext({
      agentId: 'worker-1@team-alpha',
      agentName: 'worker-1',
      teamName: 'team-alpha',
      planModeRequired: false,
      parentSessionId: 'parent-session',
      abortController: new AbortController(),
    })

    const leadJob = await CronCreateTool.call!(
      {
        cron: '11 * * * *',
        prompt: 'lead-only task',
      },
      toolUseContext,
      allowWithOriginalInput,
      {} as never,
    )

    const teammateJob = await runWithTeammateContext(
      teammateContext,
      async () =>
        CronCreateTool.call!(
          {
            cron: '12 * * * *',
            prompt: 'teammate task',
          },
          toolUseContext,
          allowWithOriginalInput,
          {} as never,
        ),
    )

    const leadList = await CronListTool.call!(
      {},
      toolUseContext,
      allowWithOriginalInput,
      {} as never,
    )
    expect(leadList.data.jobs.map(job => job.prompt).sort()).toEqual([
      'lead-only task',
      'teammate task',
    ])

    const teammateList = await runWithTeammateContext(
      teammateContext,
      async () =>
        CronListTool.call!(
          {},
          toolUseContext,
          allowWithOriginalInput,
          {} as never,
        ),
    )
    expect(teammateList.data.jobs).toEqual([
      expect.objectContaining({
        id: teammateJob.data.id,
        prompt: 'teammate task',
        durable: false,
      }),
    ])

    const deleteValidation = await runWithTeammateContext(
      teammateContext,
      async () =>
        CronDeleteTool.validateInput!({ id: leadJob.data.id }, toolUseContext),
    )
    expect(deleteValidation).toEqual({
      result: false,
      message: `Cannot delete cron job '${leadJob.data.id}': owned by another agent`,
      errorCode: 2,
    })
  })

  it('rejects durable cron creation from a teammate context', async () => {
    const toolUseContext = createToolUseContext([CronCreateTool])
    const teammateContext = createTeammateContext({
      agentId: 'worker-1@team-alpha',
      agentName: 'worker-1',
      teamName: 'team-alpha',
      planModeRequired: false,
      parentSessionId: 'parent-session',
      abortController: new AbortController(),
    })

    const validation = await runWithTeammateContext(
      teammateContext,
      async () =>
        CronCreateTool.validateInput!(
          {
            cron: '17 * * * *',
            prompt: 'durable teammate task',
            durable: true,
          },
          toolUseContext,
        ),
    )

    expect(validation).toEqual({
      result: false,
      message:
        'durable crons are not supported for teammates (teammates do not persist across sessions)',
      errorCode: 4,
    })
  })
})
