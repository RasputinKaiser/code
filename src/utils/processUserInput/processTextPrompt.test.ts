import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  getPromptId,
  resetStateForTests,
  setEventLogger,
} from '../../bootstrap/state.js'
import {
  _resetForTesting as resetAnalytics,
  attachAnalyticsSink,
} from '../../services/analytics/index.js'
import type { AttachmentMessage } from '../../types/message.js'
import {
  _setGlobalConfigCacheForTesting,
  enableConfigs,
} from '../config.js'
import { processTextPrompt } from './processTextPrompt.js'

const analyticsEvents: Array<{
  eventName: string
  metadata: Record<string, boolean | number | undefined>
}> = []
const otelEvents: Array<{
  body: string
  attributes: Record<string, unknown>
}> = []

let originalNodeEnv: string | undefined
let originalOtelLogUserPrompts: string | undefined
const originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR
let tempConfigDir = ''

beforeAll(async () => {
  tempConfigDir = await mkdtemp(join(tmpdir(), 'ncode-process-text-prompt-'))
})

beforeEach(() => {
  originalNodeEnv = process.env.NODE_ENV
  originalOtelLogUserPrompts = process.env.OTEL_LOG_USER_PROMPTS

  process.env.NODE_ENV = 'test'
  delete process.env.OTEL_LOG_USER_PROMPTS
  process.env.CLAUDE_CONFIG_DIR = tempConfigDir

  analyticsEvents.length = 0
  otelEvents.length = 0

  _setGlobalConfigCacheForTesting(null)
  enableConfigs()
  resetStateForTests()
  resetAnalytics()
  attachAnalyticsSink({
    logEvent(eventName, metadata) {
      analyticsEvents.push({ eventName, metadata })
    },
    async logEventAsync(eventName, metadata) {
      analyticsEvents.push({ eventName, metadata })
    },
  })
  setEventLogger({
    emit(record) {
      otelEvents.push(record as typeof otelEvents[number])
    },
  } as never)
})

afterEach(() => {
  process.env.NODE_ENV = 'test'
  setEventLogger(null)
  resetAnalytics()
  _setGlobalConfigCacheForTesting(null)
  resetStateForTests()

  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV
  } else {
    process.env.NODE_ENV = originalNodeEnv
  }

  if (originalOtelLogUserPrompts === undefined) {
    delete process.env.OTEL_LOG_USER_PROMPTS
  } else {
    process.env.OTEL_LOG_USER_PROMPTS = originalOtelLogUserPrompts
  }
})

afterAll(async () => {
  _setGlobalConfigCacheForTesting(null)
  if (originalClaudeConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir
  }
  await rm(tempConfigDir, {
    recursive: true,
    force: true,
  })
})

function createAttachmentMessage(type: string): AttachmentMessage {
  return {
    type: 'attachment',
    attachment: { type } as never,
    uuid: `attachment-${type}`,
    timestamp: '2026-04-13T00:00:00.000Z',
  }
}

function runWithOtelEnabled<T>(fn: () => T): T {
  const previousNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'
  try {
    return fn()
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = previousNodeEnv
    }
  }
}

describe('processTextPrompt', () => {
  it('logs prompt telemetry and prompt classification for plain-text input', () => {
    const prompt = 'keep going, this is so frustrating'
    const attachment = createAttachmentMessage('note')

    const result = runWithOtelEnabled(() =>
      processTextPrompt(prompt, [], [], [attachment], 'user-1', 'acceptEdits'),
    )

    const promptId = getPromptId()

    expect(result.messages[0]).toMatchObject({
      type: 'user',
      uuid: 'user-1',
      permissionMode: 'acceptEdits',
      message: {
        role: 'user',
        content: prompt,
      },
    })
    expect(result.messages[1]).toEqual(attachment)

    expect(promptId).toEqual(expect.any(String))
    expect(otelEvents).toHaveLength(1)
    expect(otelEvents[0]).toMatchObject({
      body: 'claude_code.user_prompt',
      attributes: {
        'event.name': 'user_prompt',
        prompt_length: String(prompt.length),
        prompt: '<REDACTED>',
        'prompt.id': promptId,
      },
    })
    expect(analyticsEvents).toHaveLength(1)
    expect(analyticsEvents[0]).toMatchObject({
      eventName: 'ncode_input_prompt',
      metadata: {
        is_negative: true,
        is_keep_going: true,
      },
    })
  })

  it('uses the last text block for otel while preserving the full array content', () => {
    const actualPrompt = 'continue'
    const input = [
      {
        type: 'text' as const,
        text: '<ide_selection>current file</ide_selection>',
      },
      {
        type: 'image' as const,
        source: { type: 'base64', media_type: 'image/png', data: 'AAA' },
      },
      { type: 'text' as const, text: actualPrompt },
    ]

    const result = runWithOtelEnabled(() =>
      processTextPrompt(input, [], [], [], 'user-2'),
    )

    const promptId = getPromptId()

    expect(result.messages[0]).toMatchObject({
      type: 'user',
      uuid: 'user-2',
      message: {
        role: 'user',
        content: input,
      },
    })

    expect(promptId).toEqual(expect.any(String))
    expect(otelEvents).toHaveLength(1)
    expect(otelEvents[0]).toMatchObject({
      body: 'claude_code.user_prompt',
      attributes: {
        'event.name': 'user_prompt',
        prompt_length: String(actualPrompt.length),
        prompt: '<REDACTED>',
        'prompt.id': promptId,
      },
    })
  })

  it('places text before pasted images and carries image metadata through', () => {
    const imageBlocks = [
      {
        type: 'image' as const,
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: 'AAA',
        },
      },
      {
        type: 'image' as const,
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: 'BBB',
        },
      },
    ]

    const result = runWithOtelEnabled(() =>
      processTextPrompt(
        'describe this',
        imageBlocks,
        [7, 9],
        [],
        'user-3',
        'default',
        true,
      ),
    )

    expect(result.messages[0]).toMatchObject({
      type: 'user',
      uuid: 'user-3',
      permissionMode: 'default',
      isMeta: true,
      imagePasteIds: [7, 9],
      message: {
        role: 'user',
        content: [{ type: 'text', text: 'describe this' }, ...imageBlocks],
      },
    })
  })
})
