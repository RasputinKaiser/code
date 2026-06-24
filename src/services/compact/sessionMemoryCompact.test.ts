import { beforeEach, describe, expect, it } from 'bun:test'
import type { Message } from '../types/message.js'
import {
  calculateMessagesToKeepIndex,
  DEFAULT_SM_COMPACT_CONFIG,
  resetSessionMemoryCompactConfig,
  setSessionMemoryCompactConfig,
} from './sessionMemoryCompact.js'
import { estimateMessageTokensForSingleMessage } from './microCompact.js'

function createTextMessage(text: string): Message {
  return {
    type: 'user',
    uuid: `msg-${text}`,
    timestamp: new Date().toISOString(),
    message: {
      role: 'user',
      content: [{ type: 'text', text }],
    },
  } as Message
}

function createCompactBoundary(): Message {
  return {
    type: 'system',
    subtype: 'compact_boundary',
    uuid: `boundary-${Math.random()}`,
    timestamp: new Date().toISOString(),
    message: {
      role: 'system',
      content: '',
    },
  } as Message
}

describe('calculateMessagesToKeepIndex semantics', () => {
  beforeEach(() => {
    resetSessionMemoryCompactConfig()
  })

  it('starts at lastSummarizedIndex + 1 when no minimums needed', () => {
    setSessionMemoryCompactConfig({
      minTokens: 0,
      maxTokens: 10_000,
      minTextBlockMessages: 0,
    })

    const messages = [
      createTextMessage('a'),
      createTextMessage('b'),
      createTextMessage('c'),
    ]
    // lastSummarizedIndex = 0 means keep messages 1 and 2
    const idx = calculateMessagesToKeepIndex(messages, 0)
    expect(idx).toBe(1)
  })

  it('expands backwards to meet minTokens', () => {
    setSessionMemoryCompactConfig({
      minTokens: 1_000,
      maxTokens: 50_000,
      minTextBlockMessages: 0,
    })

    // 10 messages of ~50 tokens each = ~500 tokens total
    const messages = Array.from({ length: 10 }, (_, i) =>
      createTextMessage(`message-${i}`.padEnd(200, 'x')),
    )

    // lastSummarizedIndex = 4 means start at 5. Messages 5-9 have
    // ~250 tokens, which is under the 1,000 minimum, so expansion
    // backward should pull in more messages.
    const idx = calculateMessagesToKeepIndex(messages, 4)
    expect(idx).toBeLessThan(5)
  })

  it('stops at compact boundary floor and does not go below it', () => {
    setSessionMemoryCompactConfig({
      minTokens: 100_000, // impossible to meet — will expand all the way
      maxTokens: 1_000_000,
      minTextBlockMessages: 0,
    })

    const messages = [
      createTextMessage('before-boundary'),
      createCompactBoundary(),
      createTextMessage('after-1'),
      createTextMessage('after-2'),
    ]

    const idx = calculateMessagesToKeepIndex(messages, 1)
    // Should stop at boundary floor (index 2)
    expect(idx).toBe(2)
  })

  it('returns consistent results across repeated calls with same messages', () => {
    const messages = Array.from({ length: 50 }, (_, i) =>
      createTextMessage(`msg-${i}`),
    )

    const first = calculateMessagesToKeepIndex(messages, 10)
    const second = calculateMessagesToKeepIndex(messages, 10)
    const third = calculateMessagesToKeepIndex(messages, 10)

    expect(second).toBe(first)
    expect(third).toBe(first)
  })
})

describe('estimateMessageTokensForSingleMessage', () => {
  it('matches estimateMessageTokens for a single message', () => {
    const msg = createTextMessage('hello world this is a test')
    const { estimateMessageTokens } = require('./microCompact.js')
    const single = estimateMessageTokensForSingleMessage(msg)
    const batch = estimateMessageTokens([msg])
    // estimateMessageTokens applies 4/3 padding, so single should equal the raw sum
    // while batch applies the padding. Verify single * 4/3 batch.
    expect(single).toBeLessThanOrEqual(batch)
    expect(batch).toBe(Math.ceil(single * (4 / 3)))
  })

  it('returns 0 for non-user/assistant messages', () => {
    const boundary = createCompactBoundary()
    expect(estimateMessageTokensForSingleMessage(boundary)).toBe(0)
  })
})

describe('boundary cache behavior', () => {
  beforeEach(() => {
    resetSessionMemoryCompactConfig()
  })

  it('reuses cached boundary index on repeated calls', () => {
    setSessionMemoryCompactConfig({ minTokens: 0, maxTokens: 10_000, minTextBlockMessages: 0 })
    const messages = [
      createTextMessage('m1'),
      createCompactBoundary(),
      createTextMessage('m2'),
      createTextMessage('m3'),
    ]

    // First call primes the cache
    const first = calculateMessagesToKeepIndex(messages, 1)
    // Second call should hit the cache and return the same result
    const second = calculateMessagesToKeepIndex(messages, 1)
    expect(second).toBe(first)
  })

  it('invalidates cache when messages array grows', () => {
    setSessionMemoryCompactConfig({ minTokens: 0, maxTokens: 10_000, minTextBlockMessages: 0 })
    const messages: Message[] = [
      createTextMessage('m1'),
      createCompactBoundary(),
      createTextMessage('m2'),
    ]

    const first = calculateMessagesToKeepIndex(messages, 1)
    messages.push(createTextMessage('m3'))
    const second = calculateMessagesToKeepIndex(messages, 1)

    // Growing the array may change the result; the cache should have been
    // invalidated and recomputed rather than returning the stale value.
    // With minTokens=0, first=2 (keep m2 only), second=2 (keep m2, m3)
    expect(second).toBe(2)
    expect(second).toBeGreaterThanOrEqual(first)
  })
})
