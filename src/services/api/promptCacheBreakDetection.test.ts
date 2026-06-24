import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  _resetForTesting as resetAnalytics,
  attachAnalyticsSink,
} from '../analytics/index.js'
import {
  checkResponseForCacheBreak,
  notifyCacheDeletion,
  notifyCompaction,
  recordPromptState,
  resetPromptCacheBreakDetection,
} from './promptCacheBreakDetection.js'

const events: Array<{
  eventName: string
  metadata: Record<string, unknown>
}> = []

function installAnalyticsSink(): void {
  attachAnalyticsSink({
    logEvent(eventName, metadata) {
      events.push({
        eventName,
        metadata: { ...metadata } as Record<string, unknown>,
      })
    },
    async logEventAsync(eventName, metadata) {
      events.push({
        eventName,
        metadata: { ...metadata } as Record<string, unknown>,
      })
    },
  })
}

function recentMessages() {
  return [
    {
      type: 'assistant',
      timestamp: new Date().toISOString(),
    },
  ] as never[]
}

beforeEach(() => {
  resetPromptCacheBreakDetection()
  resetAnalytics()
  events.length = 0
  installAnalyticsSink()
})

afterEach(() => {
  resetPromptCacheBreakDetection()
  resetAnalytics()
  events.length = 0
})

describe('promptCacheBreakDetection', () => {
  it('suppresses one expected cache drop after cache deletion and then resumes break detection', async () => {
    recordPromptState({
      system: [{ type: 'text', text: 'system prompt' }],
      toolSchemas: [],
      querySource: 'repl_main_thread' as never,
      model: 'claude-3-7-sonnet-20250219',
    })

    await checkResponseForCacheBreak(
      'repl_main_thread' as never,
      10_000,
      0,
      recentMessages(),
    )

    notifyCacheDeletion('repl_main_thread' as never)

    await checkResponseForCacheBreak(
      'repl_main_thread' as never,
      5_000,
      0,
      recentMessages(),
    )

    expect(events).toEqual([])

    await checkResponseForCacheBreak(
      'repl_main_thread' as never,
      1_000,
      0,
      recentMessages(),
    )

    expect(events).toHaveLength(1)
    expect(events[0]?.eventName).toBe('ncode_prompt_cache_break')
    expect(events[0]?.metadata).toMatchObject({
      prevCacheReadTokens: 5_000,
      cacheReadTokens: 1_000,
      cacheCreationTokens: 0,
      lastAssistantMsgOver5minAgo: false,
      lastAssistantMsgOver1hAgo: false,
    })
  })

  it('resets the cache-read baseline after compaction', async () => {
    recordPromptState({
      system: [{ type: 'text', text: 'system prompt' }],
      toolSchemas: [],
      querySource: 'repl_main_thread' as never,
      model: 'claude-3-7-sonnet-20250219',
    })

    await checkResponseForCacheBreak(
      'repl_main_thread' as never,
      10_000,
      0,
      recentMessages(),
    )

    notifyCompaction('repl_main_thread' as never)

    await checkResponseForCacheBreak(
      'repl_main_thread' as never,
      8_000,
      0,
      recentMessages(),
    )

    expect(events).toEqual([])

    await checkResponseForCacheBreak(
      'repl_main_thread' as never,
      5_000,
      0,
      recentMessages(),
    )

    expect(events).toHaveLength(1)
    expect(events[0]?.metadata).toMatchObject({
      prevCacheReadTokens: 8_000,
      cacheReadTokens: 5_000,
      cacheCreationTokens: 0,
    })
  })

  it('shares compact tracking state with the main repl thread for compaction resets', async () => {
    recordPromptState({
      system: [{ type: 'text', text: 'system prompt' }],
      toolSchemas: [],
      querySource: 'compact' as never,
      model: 'claude-3-7-sonnet-20250219',
    })

    await checkResponseForCacheBreak(
      'compact' as never,
      10_000,
      0,
      recentMessages(),
    )

    notifyCompaction('repl_main_thread' as never)

    await checkResponseForCacheBreak(
      'compact' as never,
      5_000,
      0,
      recentMessages(),
    )

    expect(events).toEqual([])
  })
})
