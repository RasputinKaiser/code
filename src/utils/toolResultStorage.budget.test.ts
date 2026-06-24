import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync } from 'fs'
import { mkdtemp, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { getOriginalCwd, setOriginalCwd } from '../bootstrap/state.js'
import { _resetForTesting as resetAnalytics } from '../services/analytics/index.js'
import { resetGrowthBook } from '../services/analytics/growthbook.js'
import type { Message } from '../types/message.js'
import {
  PERSISTED_OUTPUT_TAG,
  applyToolResultBudget,
  createContentReplacementState,
  enforceToolResultBudget,
  getToolResultPath,
} from './toolResultStorage.js'

let tempConfigDir = ''
let tempOriginalCwd = ''

const originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR
const originalUserType = process.env.USER_TYPE
const originalFcOverrides = process.env.CLAUDE_INTERNAL_FC_OVERRIDES
const originalOriginalCwd = getOriginalCwd()

function restoreEnvVar(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
}

function setGrowthBookOverrides(overrides: Record<string, unknown>): void {
  process.env.USER_TYPE = 'ant'
  process.env.CLAUDE_INTERNAL_FC_OVERRIDES = JSON.stringify(overrides)
  resetGrowthBook()
}

beforeEach(async () => {
  resetAnalytics()
  restoreEnvVar('USER_TYPE', originalUserType)
  restoreEnvVar('CLAUDE_INTERNAL_FC_OVERRIDES', originalFcOverrides)
  resetGrowthBook()

  tempConfigDir = await mkdtemp(join(tmpdir(), 'ncode-tool-config-'))
  tempOriginalCwd = await mkdtemp(join(tmpdir(), 'ncode-tool-project-'))
  process.env.CLAUDE_CONFIG_DIR = tempConfigDir
  setOriginalCwd(tempOriginalCwd)
})

afterEach(async () => {
  resetAnalytics()
  restoreEnvVar('CLAUDE_CONFIG_DIR', originalClaudeConfigDir)
  restoreEnvVar('USER_TYPE', originalUserType)
  restoreEnvVar('CLAUDE_INTERNAL_FC_OVERRIDES', originalFcOverrides)
  resetGrowthBook()
  setOriginalCwd(originalOriginalCwd)

  await rm(tempConfigDir, { recursive: true, force: true })
  await rm(tempOriginalCwd, { recursive: true, force: true })
  tempConfigDir = ''
  tempOriginalCwd = ''
})

function createAssistantToolUseMessage(
  toolUseId: string,
  toolName: string,
): Message {
  return {
    type: 'assistant',
    uuid: `assistant-${toolUseId}`,
    message: {
      id: `assistant-message-${toolUseId}`,
      model: 'gpt-test',
      content: [
        {
          type: 'tool_use',
          id: toolUseId,
          name: toolName,
          input: {},
        },
      ],
    },
  } as unknown as Message
}

function createToolResultMessage(
  blocks: Array<{ toolUseId: string; content: string }>,
): Message {
  return {
    type: 'user',
    uuid: 'user-1',
    message: {
      role: 'user',
      content: blocks.map(block => ({
        type: 'tool_result',
        tool_use_id: block.toolUseId,
        content: block.content,
      })),
    },
  } as unknown as Message
}

describe('toolResultStorage message-budget contracts', () => {
  it('persists the largest fresh result once and re-applies the cached preview on later turns', async () => {
    setGrowthBookOverrides({ ncode_hawthorn_window: 10 })

    const state = createContentReplacementState()
    const transcriptWrites: Array<
      Array<{ kind: string; toolUseId: string; replacement: string }>
    > = []
    const largeContent = 'ABCDEFGHIJKLMN'
    const smallContent = 'tiny!'
    const messages = [
      createToolResultMessage([
        { toolUseId: 'tool-large', content: largeContent },
        { toolUseId: 'tool-small', content: smallContent },
      ]),
    ]

    const firstMessages = await applyToolResultBudget(
      messages,
      state,
      records =>
        transcriptWrites.push(
          records.map(record => ({
            kind: record.kind,
            toolUseId: record.toolUseId,
            replacement: record.replacement,
          })),
        ),
    )

    expect(transcriptWrites).toHaveLength(1)
    expect(transcriptWrites[0]).toHaveLength(1)
    expect(transcriptWrites[0]?.[0]).toMatchObject({
      kind: 'tool-result',
      toolUseId: 'tool-large',
    })

    const expectedPath = getToolResultPath('tool-large', false)
    const firstContent = (firstMessages[0] as Message).message.content as Array<{
      type: string
      tool_use_id: string
      content: string
    }>

    expect(firstContent[0]?.content).toBe(
      transcriptWrites[0]?.[0]?.replacement,
    )
    expect(firstContent[0]?.content).toContain(PERSISTED_OUTPUT_TAG)
    expect(firstContent[0]?.content).toContain(expectedPath)
    expect(firstContent[1]?.content).toBe(smallContent)
    expect(existsSync(expectedPath)).toBe(true)
    expect(await readFile(expectedPath, 'utf8')).toBe(largeContent)
    expect([...state.seenIds].sort()).toEqual(['tool-large', 'tool-small'])
    expect(state.replacements.get('tool-large')).toBe(
      transcriptWrites[0]?.[0]?.replacement,
    )

    const secondTranscriptWrites: Array<unknown[]> = []
    const secondMessages = await applyToolResultBudget(
      messages,
      state,
      records => secondTranscriptWrites.push(records),
    )
    const secondContent = (
      secondMessages[0] as Message
    ).message.content as Array<{
      type: string
      tool_use_id: string
      content: string
    }>

    expect(secondTranscriptWrites).toEqual([])
    expect(secondContent[0]?.content).toBe(transcriptWrites[0]?.[0]?.replacement)
    expect(secondContent[1]?.content).toBe(smallContent)
  })

  it('freezes skipToolNames decisions so skipped results are not persisted later', async () => {
    setGrowthBookOverrides({ ncode_hawthorn_window: 5 })

    const state = createContentReplacementState()
    const messages = [
      createAssistantToolUseMessage('tool-read', 'Read'),
      createToolResultMessage([
        { toolUseId: 'tool-read', content: '123456789' },
      ]),
    ]

    const firstPass = await enforceToolResultBudget(
      messages,
      state,
      new Set(['Read']),
    )

    expect(firstPass.newlyReplaced).toEqual([])
    expect((firstPass.messages[1] as Message).message.content).toEqual(
      (messages[1] as Message).message.content,
    )
    expect([...state.seenIds]).toEqual(['tool-read'])
    expect(state.replacements.size).toBe(0)
    expect(existsSync(getToolResultPath('tool-read', false))).toBe(false)

    const secondPass = await enforceToolResultBudget(messages, state)

    expect(secondPass.newlyReplaced).toEqual([])
    expect((secondPass.messages[1] as Message).message.content).toEqual(
      (messages[1] as Message).message.content,
    )
    expect(state.replacements.size).toBe(0)
    expect(existsSync(getToolResultPath('tool-read', false))).toBe(false)
  })

  it('treats consecutive user tool results as one budget group until an assistant boundary appears', async () => {
    setGrowthBookOverrides({ ncode_hawthorn_window: 10 })

    const state = createContentReplacementState()
    const messages = [
      createToolResultMessage([{ toolUseId: 'tool-1', content: '1234567' }]),
      { type: 'progress' } as unknown as Message,
      createToolResultMessage([{ toolUseId: 'tool-2', content: 'abcdef' }]),
    ]

    const result = await enforceToolResultBudget(messages, state)
    const firstUserContent = (result.messages[0] as Message).message.content as Array<{
      type: string
      tool_use_id: string
      content: string
    }>
    const secondUserContent = (result.messages[2] as Message).message.content as Array<{
      type: string
      tool_use_id: string
      content: string
    }>

    expect(result.newlyReplaced).toHaveLength(1)
    expect(result.newlyReplaced[0]).toMatchObject({
      kind: 'tool-result',
      toolUseId: 'tool-1',
    })
    expect(firstUserContent[0]?.content).toContain(PERSISTED_OUTPUT_TAG)
    expect(secondUserContent[0]?.content).toBe('abcdef')
    expect([...state.seenIds].sort()).toEqual(['tool-1', 'tool-2'])
  })
})
