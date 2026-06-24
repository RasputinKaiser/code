import { describe, expect, it } from 'bun:test'
import { isHumanTurn } from './messagePredicates.js'

describe('isHumanTurn', () => {
  it('accepts ordinary non-meta user turns', () => {
    expect(
      isHumanTurn({
        type: 'user',
        isMeta: false,
        message: { content: 'hello' },
      } as never),
    ).toBe(true)
  })

  it('rejects tool-result user messages even though they share type user', () => {
    expect(
      isHumanTurn({
        type: 'user',
        isMeta: false,
        toolUseResult: {
          stdout: 'tool output',
        },
      } as never),
    ).toBe(false)
  })

  it('rejects meta prompts', () => {
    expect(
      isHumanTurn({
        type: 'user',
        isMeta: true,
      } as never),
    ).toBe(false)
  })
})
