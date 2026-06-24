import { describe, expect, it } from 'bun:test'
import {
  createAssistantMessage,
  createSystemMessage,
  createUserMessage,
  filterUnresolvedToolUses,
  mergeUserMessages,
} from './messages.js'

describe('mergeUserMessages', () => {
  it('preserves metadata from b when a lacks it', () => {
    // Later message (b) carries tool-result metadata that must survive merge.
    const a = createUserMessage({ content: 'Hello' })
    const b = createUserMessage({
      content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'result' }],
      sourceToolAssistantUUID: 'asst-uuid',
      toolUseResult: { data: 'value' },
      permissionMode: 'plan',
      origin: { kind: 'coordinator' },
      imagePasteIds: [1],
    })

    const merged = mergeUserMessages(a, b)

    expect(merged.sourceToolAssistantUUID).toBe('asst-uuid')
    expect(merged.toolUseResult).toEqual({ data: 'value' })
    expect(merged.permissionMode).toBe('plan')
    expect(merged.origin).toEqual({ kind: 'coordinator' })
  })

  it('later message wins metadata conflicts deterministically', () => {
    // Scalar merge policy: later operand wins. The later user message is closer
    // to the actual API block, so its metadata is the one to preserve.
    const a = createUserMessage({
      content: 'First',
      permissionMode: 'default',
      origin: { kind: 'coordinator' },
    })
    const b = createUserMessage({
      content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'result' }],
      permissionMode: 'plan',
      origin: { kind: 'channel', server: 'test' },
    })

    const merged = mergeUserMessages(a, b)

    expect(merged.permissionMode).toBe('plan')
    expect(merged.origin).toEqual({ kind: 'channel', server: 'test' })
  })

  it('merges imagePasteIds from both messages without dropping either', () => {
    const a = createUserMessage({ content: 'A', imagePasteIds: [1, 2] })
    const b = createUserMessage({ content: 'B', imagePasteIds: [2, 3] })

    const merged = mergeUserMessages(a, b)

    expect(merged.imagePasteIds).toBeDefined()
    expect(merged.imagePasteIds?.sort()).toEqual([1, 2, 3])
  })

  it('does not change non-snip isMeta behavior', () => {
    const a = createUserMessage({ content: 'A', isMeta: true })
    const b = createUserMessage({ content: 'B' })

    const merged = mergeUserMessages(a, b)

    expect(merged.isMeta).toBe(true)
  })

  it('retains content from both messages', () => {
    const a = createUserMessage({ content: 'Hello ' })
    const b = createUserMessage({
      content: [{ type: 'tool_result', tool_use_id: 't', content: 'r' }],
    })

    const merged = mergeUserMessages(a, b)

    expect(merged.message.content.length).toBeGreaterThan(0)
  })
})

describe('filterUnresolvedToolUses', () => {
  it('preserves non-conversation transcript entries while filtering unresolved tool pairs', () => {
    const system = createSystemMessage('resume metadata')
    const messages = [
      system,
      createAssistantMessage({
        content: [
          { type: 'tool_use', id: 'ok', name: 'test', input: {} } as any,
        ],
      }),
      createUserMessage({
        content: [{ type: 'tool_result', tool_use_id: 'ok', content: 'valid' }],
      }),
      createUserMessage({
        content: [
          { type: 'tool_result', tool_use_id: 'orphan', content: 'orphan' },
        ],
      }),
    ]

    const result = filterUnresolvedToolUses(messages)

    expect(result).toHaveLength(3)
    expect(result[0]).toBe(system)
  })

  it('removes orphaned tool_result messages whose paired tool_use was removed upstream', () => {
    // Assistant with tool_use 'ok' resolves the pair. User tool_result for 'gone'
    // has no matching assistant tool_use — it is an orphan and must be removed.
    const messages = [
      createAssistantMessage({
        content: [
          { type: 'tool_use', id: 'ok', name: 'test', input: {} } as any,
        ],
      }),
      createUserMessage({
        content: [{ type: 'tool_result', tool_use_id: 'ok', content: 'valid' }],
      }),
      createUserMessage({
        content: [{ type: 'tool_result', tool_use_id: 'gone', content: 'orphan' }],
      }),
    ]

    const result = filterUnresolvedToolUses(messages)

    expect(result).toHaveLength(2)
    expect(result[0]!.type).toBe('assistant')
    expect(result[1]!.type).toBe('user')
    expect((result[1]! as any).message.content[0].tool_use_id).toBe('ok')
  })

  it('removes only orphaned tool_result blocks from mixed-content user messages', () => {
    const messages = [
      createAssistantMessage({
        content: [
          { type: 'tool_use', id: 'ok', name: 'test', input: {} } as any,
        ],
      }),
      createUserMessage({
        content: [
          { type: 'text', text: 'keep me' },
          { type: 'tool_result', tool_use_id: 'ok', content: 'valid' },
          { type: 'tool_result', tool_use_id: 'gone', content: 'orphan' },
        ],
      }),
    ]

    const result = filterUnresolvedToolUses(messages)

    expect(result).toHaveLength(2)
    const userMsg = result[1]! as any
    expect(userMsg.message.content).toHaveLength(2)
    expect(userMsg.message.content[0].text).toBe('keep me')
    expect(userMsg.message.content[1].tool_use_id).toBe('ok')
  })

  it('drops a user message that becomes empty after orphan removal', () => {
    const messages = [
      createUserMessage({
        content: [
          { type: 'tool_result', tool_use_id: 'gone', content: 'orphan only' },
        ],
      }),
    ]

    const result = filterUnresolvedToolUses(messages)

    expect(result).toHaveLength(0)
  })

  it('removes assistant messages whose tool_uses are all unresolved', () => {
    const messages = [
      createAssistantMessage({
        content: [
          { type: 'tool_use', id: 'lonely', name: 'test', input: {} } as any,
        ],
      }),
      createUserMessage({ content: 'plain text' }),
    ]

    const result = filterUnresolvedToolUses(messages)

    expect(result).toHaveLength(1)
    expect(result[0]!.type).toBe('user')
  })
})
