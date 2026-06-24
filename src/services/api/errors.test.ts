import { describe, expect, it } from 'bun:test'
import type { AssistantMessage } from 'src/types/message.js'
import {
  getAssistantMessageFromError,
  getPromptTooLongTokenGap,
  isMediaSizeError,
  isMediaSizeErrorMessage,
  parsePromptTooLongTokenCounts,
  PROMPT_TOO_LONG_ERROR_MESSAGE,
} from './errors.js'
import { OpenAICompatMalformedToolOutputError } from './openAICompatInferenceClient.js'

function createApiErrorAssistantMessage(
  text: string,
  errorDetails?: string,
): AssistantMessage {
  return {
    type: 'assistant',
    isApiErrorMessage: true,
    errorDetails,
    uuid: 'assistant-error',
    message: {
      role: 'assistant',
      content: [{ type: 'text', text }],
    },
  } as AssistantMessage
}

describe('api error recovery predicates', () => {
  it('parses prompt-too-long token counts from wrapped provider messages', () => {
    expect(
      parsePromptTooLongTokenCounts(
        'Bad request: prompt is too long: 137500 tokens > 135000 maximum',
      ),
    ).toEqual({
      actualTokens: 137500,
      limitTokens: 135000,
    })
  })

  it('returns the positive prompt-too-long token gap for reactive compact retries', () => {
    const message = createApiErrorAssistantMessage(
      `${PROMPT_TOO_LONG_ERROR_MESSAGE}.`,
      'prompt is too long: 137500 tokens > 135000 maximum',
    )

    expect(getPromptTooLongTokenGap(message)).toBe(2500)
  })

  it('ignores non-positive or unparsable prompt-too-long gaps', () => {
    const equalCounts = createApiErrorAssistantMessage(
      `${PROMPT_TOO_LONG_ERROR_MESSAGE}.`,
      'prompt is too long: 135000 tokens > 135000 maximum',
    )
    const nonApiError = {
      ...createApiErrorAssistantMessage(
        `${PROMPT_TOO_LONG_ERROR_MESSAGE}.`,
        'prompt is too long: 137500 tokens > 135000 maximum',
      ),
      isApiErrorMessage: false,
    } as AssistantMessage

    expect(getPromptTooLongTokenGap(equalCounts)).toBeUndefined()
    expect(getPromptTooLongTokenGap(nonApiError)).toBeUndefined()
  })

  it('recognizes image and PDF media-size rejections from raw API details', () => {
    expect(
      isMediaSizeError('image exceeds maximum supported size for upload'),
    ).toBe(true)
    expect(
      isMediaSizeError('Request rejected: maximum of 100 PDF pages exceeded'),
    ).toBe(true)
    expect(isMediaSizeError('prompt is too long: 137500 tokens > 135000')).toBe(
      false,
    )
  })

  it('recognizes assistant API error messages backed by media-size details', () => {
    const mediaError = createApiErrorAssistantMessage(
      'Image was too large.',
      'image dimensions exceed many-image maximum',
    )
    const plainApiError = createApiErrorAssistantMessage(
      'Some other API error.',
      'model overloaded',
    )

    expect(isMediaSizeErrorMessage(mediaError)).toBe(true)
    expect(isMediaSizeErrorMessage(plainApiError)).toBe(false)
  })

  it('maps malformed model protocol output to a typed synthetic API error', () => {
    const message = getAssistantMessageFromError(
      new OpenAICompatMalformedToolOutputError('unary'),
      'test-model',
    )

    expect(message.isApiErrorMessage).toBe(true)
    expect(message.apiError).toBe('malformed_tool_output')
    expect(message.error).toBe('invalid_request')
    expect(message.errorDetails).toBe(
      'Malformed unary tool output leaked from backend response',
    )
  })
})
