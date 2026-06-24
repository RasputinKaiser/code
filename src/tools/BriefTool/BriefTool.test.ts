import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { getDefaultAppState } from '../../state/AppStateStore.js'

const analyticsEvents: Array<{ name: string; payload: Record<string, unknown> }> =
  []
let validateResult: { result: true } | { result: false; message: string; errorCode: number } =
  { result: true }
let resolvedAttachments = [
  {
    path: '/tmp/screenshot.png',
    size: 12,
    isImage: true,
    file_uuid: 'file-uuid-1',
  },
]

const bootstrapPaths = [
  import.meta.resolve('../../bootstrap/state.ts'),
  import.meta.resolve('../../bootstrap/state.js'),
]
const growthbookPaths = [
  import.meta.resolve('../../services/analytics/growthbook.ts'),
  import.meta.resolve('../../services/analytics/growthbook.js'),
]
const analyticsPaths = [
  import.meta.resolve('../../services/analytics/index.ts'),
  import.meta.resolve('../../services/analytics/index.js'),
]
const attachmentsPaths = [
  import.meta.resolve('./attachments.ts'),
  import.meta.resolve('./attachments.js'),
]

for (const bootstrapPath of bootstrapPaths) {
  mock.module(bootstrapPath, () => ({
    getKairosActive: () => false,
    getUserMsgOptIn: () => true,
  }))
}

for (const growthbookPath of growthbookPaths) {
  mock.module(growthbookPath, () => ({
    getFeatureValue_CACHED_WITH_REFRESH: () => true,
  }))
}

for (const analyticsPath of analyticsPaths) {
  mock.module(analyticsPath, () => ({
    logEvent(name: string, payload: Record<string, unknown>) {
      analyticsEvents.push({ name, payload })
    },
  }))
}

for (const attachmentsPath of attachmentsPaths) {
  mock.module(attachmentsPath, () => ({
    validateAttachmentPaths: async () => validateResult,
    resolveAttachments: async () => resolvedAttachments,
  }))
}

const { BriefTool } = await import(import.meta.resolve('./BriefTool.ts'))

function createToolUseContext() {
  let appState = getDefaultAppState()
  const setAppState = (updater: (prev: typeof appState) => typeof appState) => {
    appState = updater(appState)
  }
  return {
    abortController: new AbortController(),
    options: {
      commands: [],
      debug: false,
      mainLoopModel: '/data/models/hf/moonshotai__Kimi-K2.7-Code',
      tools: [BriefTool] as never,
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
  analyticsEvents.length = 0
  validateResult = { result: true }
  resolvedAttachments = [
    {
      path: '/tmp/screenshot.png',
      size: 12,
      isImage: true,
      file_uuid: 'file-uuid-1',
    },
  ]
})

describe('BriefTool runtime contract', () => {
  it('validates attachment paths only when attachments are present', async () => {
    expect(await BriefTool.validateInput!({} as never, {} as never)).toEqual({
      result: true,
    })

    validateResult = {
      result: false,
      message: 'Attachment missing',
      errorCode: 1,
    }

    expect(
      await BriefTool.validateInput!(
        { attachments: ['missing.png'] } as never,
        {} as never,
      ),
    ).toEqual(validateResult)
  })

  it('returns sent messages directly without attachments', async () => {
    const result = await BriefTool.call!(
      {
        message: 'hello user',
        status: 'normal',
      },
      createToolUseContext(),
    )

    expect(result.data.message).toBe('hello user')
    expect(result.data.attachments).toBeUndefined()
    expect(result.data.sentAt).toMatch(/\d{4}-\d{2}-\d{2}T/)
    expect(analyticsEvents).toContainEqual({
      name: 'ncode_brief_send',
      payload: {
        proactive: false,
        attachment_count: 0,
      },
    })
  })

  it('resolves attachments and reports them in the tool result', async () => {
    const result = await BriefTool.call!(
      {
        message: 'see attached',
        attachments: ['screenshot.png'],
        status: 'proactive',
      },
      createToolUseContext(),
    )

    expect(result.data).toMatchObject({
      message: 'see attached',
      attachments: resolvedAttachments,
    })
    expect(
      BriefTool.mapToolResultToToolResultBlockParam!(result.data, 'toolu_brief'),
    ).toEqual({
      tool_use_id: 'toolu_brief',
      type: 'tool_result',
      content: 'Message delivered to user. (1 attachment included)',
    })
    expect(analyticsEvents).toContainEqual({
      name: 'ncode_brief_send',
      payload: {
        proactive: true,
        attachment_count: 1,
      },
    })
  })
})
