import { describe, expect, it } from 'bun:test'
import { createUserMessage } from '../../utils/messages.js'
import { classifyTranscriptSearchCorpusDelta } from './transcriptSearchCorpusDelta.js'

describe('classifyTranscriptSearchCorpusDelta', () => {
  it('returns reset when there is no previous corpus', () => {
    const next = [createUserMessage({ content: 'a' })]
    expect(classifyTranscriptSearchCorpusDelta(null, next)).toEqual({
      kind: 'reset',
    })
  })

  it('classifies append-only growth with stable anchors', () => {
    const previous = [
      createUserMessage({ content: 'a' }),
      createUserMessage({ content: 'b' }),
      createUserMessage({ content: 'c' }),
      createUserMessage({ content: 'd' }),
    ]
    const next = [
      ...previous,
      createUserMessage({ content: 'e' }),
      createUserMessage({ content: 'f' }),
    ]

    expect(classifyTranscriptSearchCorpusDelta(previous, next)).toEqual({
      kind: 'append',
      fromIndex: 4,
      toIndex: 6,
    })
  })

  it('returns reset when corpus shrinks', () => {
    const previous = [
      createUserMessage({ content: 'a' }),
      createUserMessage({ content: 'b' }),
    ]
    const next = [previous[0]!]
    expect(classifyTranscriptSearchCorpusDelta(previous, next)).toEqual({
      kind: 'reset',
    })
  })

  it('returns reset when same-length corpus is replaced', () => {
    const previous = [
      createUserMessage({ content: 'a' }),
      createUserMessage({ content: 'b' }),
    ]
    const next = [
      createUserMessage({ content: 'a' }),
      createUserMessage({ content: 'b' }),
    ]
    expect(classifyTranscriptSearchCorpusDelta(previous, next)).toEqual({
      kind: 'reset',
    })
  })

  it('returns reset when a sampled anchor shifts', () => {
    const previous = [
      createUserMessage({ content: 'a' }),
      createUserMessage({ content: 'b' }),
      createUserMessage({ content: 'c' }),
      createUserMessage({ content: 'd' }),
      createUserMessage({ content: 'e' }),
      createUserMessage({ content: 'f' }),
      createUserMessage({ content: 'g' }),
      createUserMessage({ content: 'h' }),
    ]
    const next = [...previous]
    next[4] = createUserMessage({ content: 'mid-edit' })
    next.push(createUserMessage({ content: 'tail' }))

    expect(classifyTranscriptSearchCorpusDelta(previous, next)).toEqual({
      kind: 'reset',
    })
  })
})
