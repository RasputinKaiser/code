import { describe, expect, it } from 'bun:test'
import { createUserMessage, getContentText } from '../../utils/messages.js'
import {
  createTranscriptSearchQueryCache,
  resolveTranscriptSearchQueryState,
} from './transcriptSearchQueryCache.js'
import {
  syncVirtualMessageListSearchCorpus,
  warmVirtualMessageListSearchIndex,
} from './virtualMessageListSearchController.js'

describe('virtualMessageListSearchController', () => {
  it('extends append-only corpus updates without resetting warmed state', () => {
    const initialMessages = [
      createUserMessage({ content: 'assistant alpha' }),
      createUserMessage({ content: 'beta' }),
    ]
    const nextMessages = [
      ...initialMessages,
      createUserMessage({ content: 'assistant beta' }),
    ]
    const cache = createTranscriptSearchQueryCache()
    const extractSearchText = (message: (typeof nextMessages)[number]) =>
      getContentText(message.message.content)?.toLowerCase() ?? ''

    resolveTranscriptSearchQueryState({
      cache,
      query: 'assistant',
      messageCount: initialMessages.length,
      getSearchText: index => extractSearchText(initialMessages[index]!),
    })

    const synced = syncVirtualMessageListSearchCorpus({
      previousMessages: initialMessages,
      previousExtractor: extractSearchText,
      messages: nextMessages,
      extractSearchText,
      cache,
      indexWarmed: true,
    })

    const extended = resolveTranscriptSearchQueryState({
      cache: synced.cache,
      query: 'assistant',
      messageCount: nextMessages.length,
      getSearchText: index => extractSearchText(nextMessages[index]!),
    })

    expect(synced.indexWarmed).toBe(true)
    expect(extended.matches).toEqual([0, 2])
    expect(extended.prefixSum).toEqual([0, 1, 2])
  })

  it('resets cache and warmed state when the extractor identity changes', () => {
    const messages = [
      createUserMessage({ content: 'assistant alpha' }),
      createUserMessage({ content: 'assistant beta' }),
    ]
    const cache = createTranscriptSearchQueryCache()
    const previousExtractor = (message: (typeof messages)[number]) =>
      getContentText(message.message.content)?.toLowerCase() ?? ''
    const nextExtractor = (message: (typeof messages)[number]) =>
      `wrapped:${getContentText(message.message.content)?.toLowerCase() ?? ''}`

    resolveTranscriptSearchQueryState({
      cache,
      query: 'assistant',
      messageCount: messages.length,
      getSearchText: index => previousExtractor(messages[index]!),
    })

    const synced = syncVirtualMessageListSearchCorpus({
      previousMessages: messages,
      previousExtractor,
      messages,
      extractSearchText: nextExtractor,
      cache,
      indexWarmed: true,
    })

    expect(synced.indexWarmed).toBe(false)
    expect(synced.cache.size).toBe(0)
  })

  it('warms the transcript search index once', async () => {
    const messages = [
      createUserMessage({ content: 'assistant alpha' }),
      createUserMessage({ content: 'assistant beta' }),
      createUserMessage({ content: 'assistant gamma' }),
    ]
    const indexWarmedRef = {
      current: false,
    }
    let extractCalls = 0
    const extractSearchText = (message: (typeof messages)[number]) => {
      extractCalls += 1
      return getContentText(message.message.content)?.toLowerCase() ?? ''
    }

    const first = await warmVirtualMessageListSearchIndex({
      messages,
      extractSearchText,
      indexWarmedRef,
      sleepImpl: async () => {},
    })
    const second = await warmVirtualMessageListSearchIndex({
      messages,
      extractSearchText,
      indexWarmedRef,
      sleepImpl: async () => {},
    })

    expect(first).toBeGreaterThanOrEqual(0)
    expect(second).toBe(0)
    expect(indexWarmedRef.current).toBe(true)
    expect(extractCalls).toBe(messages.length)
  })
})
