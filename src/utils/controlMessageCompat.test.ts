import { describe, expect, it } from 'bun:test'
import { normalizeControlMessageKeys } from './controlMessageCompat.js'

describe('normalizeControlMessageKeys', () => {
  it('mutates camelCase request ids to snake_case on the message and nested response', () => {
    const message = {
      type: 'control_response',
      requestId: 'outer-1',
      response: {
        requestId: 'inner-1',
      },
    }

    const normalized = normalizeControlMessageKeys(message)

    expect(normalized).toBe(message)
    expect(message).toEqual({
      type: 'control_response',
      request_id: 'outer-1',
      response: {
        request_id: 'inner-1',
      },
    })
  })

  it('preserves existing snake_case ids when both forms are present', () => {
    const message = {
      type: 'control_request',
      request_id: 'snake-top',
      requestId: 'camel-top',
      response: {
        request_id: 'snake-inner',
        requestId: 'camel-inner',
      },
    }

    normalizeControlMessageKeys(message)

    expect(message.request_id).toBe('snake-top')
    expect(message.response.request_id).toBe('snake-inner')
  })
})
