import { describe, expect, test } from 'bun:test'
import {
  CANCEL_MESSAGE,
  INTERRUPT_MESSAGE_FOR_TOOL_USE,
  REJECT_MESSAGE_WITH_REASON_PREFIX,
} from 'src/utils/messages.js'
import { getUserToolResultMessageVariant } from './UserToolResultMessage.js'

function createToolResultParam(
  content: string,
  options?: { isError?: boolean },
) {
  return {
    type: 'tool_result' as const,
    tool_use_id: 'toolu_bash_contract',
    content,
    ...(options?.isError ? { is_error: true } : {}),
  }
}

describe('UserToolResultMessage branch contract', () => {
  test('classifies interrupted tool-result content as canceled', () => {
    expect(
      getUserToolResultMessageVariant(
        createToolResultParam(CANCEL_MESSAGE),
        { hasResolvedToolUse: true },
      ),
    ).toBe('canceled')
  })

  test('classifies reject-prefixed error content as error so the error variant can render the rejection UI', () => {
    expect(
      getUserToolResultMessageVariant(
        createToolResultParam(
          `${REJECT_MESSAGE_WITH_REASON_PREFIX}wait`,
          { isError: true },
        ),
        { hasResolvedToolUse: true },
      ),
    ).toBe('error')
  })

  test('classifies interrupt error sentinel content as rejected', () => {
    expect(
      getUserToolResultMessageVariant(
        createToolResultParam(INTERRUPT_MESSAGE_FOR_TOOL_USE),
        { hasResolvedToolUse: true },
      ),
    ).toBe('rejected')
  })

  test('classifies other tool errors as error', () => {
    expect(
      getUserToolResultMessageVariant(
        createToolResultParam(
          '<tool_use_error>Error calling tool (Bash): permission denied</tool_use_error>',
          { isError: true },
        ),
        { hasResolvedToolUse: true },
      ),
    ).toBe('error')
  })

  test('classifies unresolved non-error tool results as hidden', () => {
    expect(
      getUserToolResultMessageVariant(
        createToolResultParam('completed'),
        { hasResolvedToolUse: false },
      ),
    ).toBe('hidden')
  })

  test('classifies resolved non-error tool results as success', () => {
    expect(
      getUserToolResultMessageVariant(
        createToolResultParam('completed'),
        { hasResolvedToolUse: true },
      ),
    ).toBe('success')
  })
})
