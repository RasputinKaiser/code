import { describe, expect, it } from 'bun:test'

import {
  debugBody,
  debugTruncate,
  describeAxiosError,
  extractErrorDetail,
  extractHttpStatus,
  redactSecrets,
} from './debugUtils.js'

describe('bridge debug utils', () => {
  it('redacts configured secret fields while preserving enough structure for debugging', () => {
    const input =
      '{"session_ingress_token":"1234567890abcdefZZZZ","environment_secret":"short","ignored":"leave-me-alone"}'

    expect(redactSecrets(input)).toBe(
      '{"session_ingress_token":"12345678...ZZZZ","environment_secret":"[REDACTED]","ignored":"leave-me-alone"}',
    )
  })

  it('flattens multiline output and truncates oversized debug payloads after redaction', () => {
    const longToken = 'abcdefghijklmnopqrstuvwxyz123456'
    const payload = `${'line1\n'.repeat(450)}{"token":"${longToken}"}`

    const truncated = debugTruncate(payload)
    const body = debugBody({ token: longToken, message: 'ok' })

    expect(truncated.includes('\n')).toBe(false)
    expect(truncated).toContain('\\n')
    expect(truncated).toContain('... (')
    expect(body).toContain('"token":"abcdefgh...3456"')
    expect(body).toContain('"message":"ok"')
  })

  it('extracts server-provided bridge error details from top-level and nested payloads', () => {
    expect(extractErrorDetail({ message: 'top-level detail' })).toBe(
      'top-level detail',
    )
    expect(
      extractErrorDetail({ error: { message: 'nested detail', type: 'boom' } }),
    ).toBe('nested detail')
    expect(extractErrorDetail({ error: { type: 'boom' } })).toBeUndefined()
  })

  it('describes axios errors with server detail and exposes numeric HTTP status codes', () => {
    const axiosLike = Object.assign(
      new Error('Request failed with status code 403'),
      {
        response: {
          status: 403,
          data: {
            error: {
              message: 'access denied',
            },
          },
        },
      },
    )

    expect(describeAxiosError(axiosLike)).toBe(
      'Request failed with status code 403: access denied',
    )
    expect(extractHttpStatus(axiosLike)).toBe(403)
    expect(extractHttpStatus(new Error('socket hang up'))).toBeUndefined()
  })
})
