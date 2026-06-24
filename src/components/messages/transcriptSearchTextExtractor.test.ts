import { describe, expect, test } from 'bun:test'
import { createTranscriptSearchTextExtractor } from './transcriptSearchTextExtractor.js'

describe('createTranscriptSearchTextExtractor', () => {
  test('prefers tool-owned extractSearchText and lowercases once per message', () => {
    let calls = 0
    const extractor = createTranscriptSearchTextExtractor({
      tools: [
        {
          name: 'Bash',
          description: '',
          userFacingName() {
            return 'Bash'
          },
          isReadOnly() {
            return false
          },
          async prompt() {
            throw new Error('not used')
          },
          extractSearchText() {
            calls += 1
            return 'LOUD OUTPUT'
          },
        } as never,
      ],
      lookups: {
        toolUseByToolUseID: new Map([
          ['toolu_1', { name: 'Bash' }],
        ]),
      } as never,
    })

    const message = {
      type: 'user',
      toolUseResult: { stdout: 'ignored' },
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_1',
            content: 'ignored',
          },
        ],
      },
    } as never

    expect(extractor(message)).toBe('loud output')
    expect(extractor(message)).toBe('loud output')
    expect(calls).toBe(1)
  })

  test('respects empty-string tool overrides', () => {
    const extractor = createTranscriptSearchTextExtractor({
      tools: [
        {
          name: 'Bash',
          description: '',
          userFacingName() {
            return 'Bash'
          },
          isReadOnly() {
            return false
          },
          async prompt() {
            throw new Error('not used')
          },
          extractSearchText() {
            return ''
          },
        } as never,
      ],
      lookups: {
        toolUseByToolUseID: new Map([
          ['toolu_1', { name: 'Bash' }],
        ]),
      } as never,
    })

    const message = {
      type: 'user',
      toolUseResult: { stdout: 'ignored' },
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_1',
            content: 'would have matched',
          },
        ],
      },
    } as never

    expect(extractor(message)).toBe('')
  })
})
