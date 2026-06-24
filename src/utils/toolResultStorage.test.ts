import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import type { Message } from '../types/message.js'
import { resetGrowthBook } from '../services/analytics/growthbook.js'
import {
  DEFAULT_MAX_RESULT_SIZE_CHARS,
  MAX_TOOL_RESULTS_PER_MESSAGE_CHARS,
} from '../constants/toolLimits.js'
import {
  PERSISTED_OUTPUT_TAG,
  cloneContentReplacementState,
  createContentReplacementState,
  generatePreview,
  getPerMessageBudgetLimit,
  getPersistenceThreshold,
  isToolResultContentEmpty,
  reconstructContentReplacementState,
  reconstructForSubagentResume,
} from './toolResultStorage.js'

const originalUserType = process.env.USER_TYPE
const originalFcOverrides = process.env.CLAUDE_INTERNAL_FC_OVERRIDES

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

beforeEach(() => {
  restoreEnvVar('USER_TYPE', originalUserType)
  restoreEnvVar('CLAUDE_INTERNAL_FC_OVERRIDES', originalFcOverrides)
  resetGrowthBook()
})

afterEach(() => {
  restoreEnvVar('USER_TYPE', originalUserType)
  restoreEnvVar('CLAUDE_INTERNAL_FC_OVERRIDES', originalFcOverrides)
  resetGrowthBook()
})

function createToolResultMessage(
  blocks: Array<{
    toolUseId: string
    content: unknown
  }>,
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

describe('toolResultStorage threshold contracts', () => {
  it('treats Infinity as a hard opt-out even when GrowthBook serves an override', () => {
    setGrowthBookOverrides({
      ncode_satin_quoll: {
        Read: 1234,
      },
    })

    expect(getPersistenceThreshold('Read', Number.POSITIVE_INFINITY)).toBe(
      Number.POSITIVE_INFINITY,
    )
  })

  it('uses a finite positive GrowthBook override and otherwise falls back to the default clamp', () => {
    setGrowthBookOverrides({
      ncode_satin_quoll: {
        Bash: 64000,
        Broken: 'bad-value',
      },
    })

    expect(getPersistenceThreshold('Bash', 120000)).toBe(64000)
    expect(getPersistenceThreshold('Broken', 120000)).toBe(
      DEFAULT_MAX_RESULT_SIZE_CHARS,
    )
    expect(getPersistenceThreshold('SmallTool', 2500)).toBe(2500)
  })

  it('uses a finite positive per-message budget override and ignores invalid values', () => {
    setGrowthBookOverrides({ ncode_hawthorn_window: 9001 })
    expect(getPerMessageBudgetLimit()).toBe(9001)

    setGrowthBookOverrides({ ncode_hawthorn_window: 'oops' })
    expect(getPerMessageBudgetLimit()).toBe(
      MAX_TOOL_RESULTS_PER_MESSAGE_CHARS,
    )
  })
})

describe('toolResultStorage content contracts', () => {
  it('treats whitespace-only strings and text-only empty arrays as empty', () => {
    expect(isToolResultContentEmpty(undefined)).toBe(true)
    expect(isToolResultContentEmpty('   \n\t')).toBe(true)
    expect(
      isToolResultContentEmpty([
        { type: 'text', text: '' },
        { type: 'text', text: '   ' },
      ] as never),
    ).toBe(true)
  })

  it('treats non-text content blocks as non-empty', () => {
    expect(
      isToolResultContentEmpty([
        { type: 'image', source: { type: 'base64', data: 'AA==', media_type: 'image/png' } },
      ] as never),
    ).toBe(false)
  })

  it('cuts previews at a nearby newline and otherwise at the byte limit', () => {
    expect(generatePreview('alpha\nbeta\ngamma', 9)).toEqual({
      preview: 'alpha',
      hasMore: true,
    })
    expect(generatePreview('abcdefghijklmnop', 8)).toEqual({
      preview: 'abcdefgh',
      hasMore: true,
    })
  })
})

describe('toolResultStorage replacement-state contracts', () => {
  it('clones replacement state without sharing mutable Set and Map instances', () => {
    const original = createContentReplacementState()
    original.seenIds.add('tool-a')
    original.replacements.set('tool-a', 'preview-a')

    const cloned = cloneContentReplacementState(original)
    cloned.seenIds.add('tool-b')
    cloned.replacements.set('tool-a', 'preview-b')

    expect([...original.seenIds]).toEqual(['tool-a'])
    expect(original.replacements.get('tool-a')).toBe('preview-a')
  })

  it('reconstructs seen ids from eligible tool results and ignores stale records', () => {
    const messages = [
      createToolResultMessage([
        { toolUseId: 'tool-1', content: 'full output' },
        { toolUseId: 'tool-2', content: [{ type: 'text', text: 'json text' }] },
        {
          toolUseId: 'tool-3',
          content: `${PERSISTED_OUTPUT_TAG}\nalready compacted`,
        },
        {
          toolUseId: 'tool-4',
          content: [{ type: 'image', source: { type: 'base64', data: 'AA==', media_type: 'image/png' } }],
        },
      ]),
    ]

    const state = reconstructContentReplacementState(messages, [
      {
        kind: 'tool-result',
        toolUseId: 'tool-1',
        replacement: 'preview-1',
      },
      {
        kind: 'tool-result',
        toolUseId: 'tool-missing',
        replacement: 'stale-preview',
      },
    ])

    expect([...state.seenIds].sort()).toEqual(['tool-1', 'tool-2'])
    expect([...state.replacements.entries()]).toEqual([['tool-1', 'preview-1']])
  })

  it('fills missing subagent replacements from the parent state on resume', () => {
    const parentState = createContentReplacementState()
    parentState.replacements.set('tool-2', 'parent-preview')

    const resumedMessages = [
      createToolResultMessage([
        { toolUseId: 'tool-1', content: 'fresh output' },
        { toolUseId: 'tool-2', content: 'reapplied output' },
      ]),
    ]

    const resumedState = reconstructForSubagentResume(parentState, resumedMessages, [
      {
        kind: 'tool-result',
        toolUseId: 'tool-1',
        replacement: 'recorded-preview',
      },
    ])

    expect(resumedState?.replacements.get('tool-1')).toBe('recorded-preview')
    expect(resumedState?.replacements.get('tool-2')).toBe('parent-preview')
    expect([...resumedState?.seenIds ?? []].sort()).toEqual(['tool-1', 'tool-2'])
  })

  it('caps seenIds at 500 entries, evicting oldest insertion first', () => {
    const messages: Message[] = []
    const records: { kind: 'tool-result'; toolUseId: string; replacement: string }[] = []

    for (let i = 0; i < 600; i++) {
      messages.push(
        createToolResultMessage([
          { toolUseId: `tool-${i}`, content: `output ${i}` },
        ]),
      )
      if (i % 2 === 0) {
        records.push({
          kind: 'tool-result',
          toolUseId: `tool-${i}`,
          replacement: `preview-${i}`,
        })
      }
    }

    const state = reconstructContentReplacementState(messages, records)
    expect(state.seenIds.size).toBe(500)
    // Oldest 100 (tool-0 through tool-99) should have been evicted
    expect(state.seenIds.has('tool-0')).toBe(false)
    expect(state.seenIds.has('tool-99')).toBe(false)
    expect(state.seenIds.has('tool-100')).toBe(true)
    expect(state.seenIds.has('tool-599')).toBe(true)
  })

  it('caps replacements at 500 entries, evicting oldest insertion first', () => {
    const messages: Message[] = []
    const records: { kind: 'tool-result'; toolUseId: string; replacement: string }[] = []

    for (let i = 0; i < 600; i++) {
      messages.push(
        createToolResultMessage([
          { toolUseId: `tool-${i}`, content: `output ${i}` },
        ]),
      )
      records.push({
        kind: 'tool-result',
        toolUseId: `tool-${i}`,
        replacement: `preview-${i}`,
      })
    }

    const state = reconstructContentReplacementState(messages, records)
    expect(state.replacements.size).toBe(500)
    expect(state.replacements.has('tool-0')).toBe(false)
    expect(state.replacements.has('tool-99')).toBe(false)
    expect(state.replacements.has('tool-100')).toBe(true)
    expect(state.replacements.has('tool-599')).toBe(true)
  })

  it('allows reprocessing of evicted IDs after cap', () => {
    // First batch: populate state with 600 IDs, evicting oldest 100
    const batch1: Message[] = []
    for (let i = 0; i < 600; i++) {
      batch1.push(
        createToolResultMessage([
          { toolUseId: `tool-${i}`, content: `output ${i}` },
        ]),
      )
    }
    const state = reconstructContentReplacementState(batch1, [])
    expect(state.seenIds.has('tool-0')).toBe(false)

    // Second batch: tool-0 reappears — it was evicted, so it should be
    // present again after reconstruction
    const batch2 = [
      createToolResultMessage([
        { toolUseId: 'tool-0', content: 'reappeared output' },
      ]),
    ]
    const state2 = reconstructContentReplacementState(batch2, [])
    expect(state2.seenIds.has('tool-0')).toBe(true)
  })
})
