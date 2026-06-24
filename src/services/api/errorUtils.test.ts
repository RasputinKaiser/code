import { describe, expect, it } from 'bun:test'
import type { APIError } from '@anthropic-ai/sdk'
import { formatAPIError, getSSLErrorHint } from './errorUtils.js'

function withCode(message: string, code: string, cause?: unknown): Error {
  const error = new Error(message, cause ? { cause } : undefined) as Error & {
    code?: string
  }
  error.code = code
  return error
}

function createApiError(
  message: string | undefined,
  opts?: {
    status?: number
    cause?: unknown
    error?: unknown
  },
): APIError {
  const error = new Error(message ?? '', opts?.cause ? { cause: opts.cause } : undefined) as Error &
    APIError & {
      error?: unknown
    }
  error.status = opts?.status as APIError['status']
  if (opts?.error !== undefined) {
    error.error = opts.error
  }
  return error
}

describe('errorUtils', () => {
  it('formats wrapped SSL verification failures as actionable proxy guidance', () => {
    const error = createApiError('Connection error.', {
      cause: withCode(
        'certificate verify failed',
        'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      ),
    })

    expect(formatAPIError(error)).toBe(
      'Unable to connect to API: SSL certificate verification failed. Check your proxy or corporate SSL certificates',
    )
  })

  it('formats wrapped timeouts as connectivity guidance', () => {
    const error = createApiError('Connection error.', {
      cause: withCode('timed out', 'ETIMEDOUT'),
    })

    expect(formatAPIError(error)).toBe(
      'Request timed out. Check your internet connection and proxy settings',
    )
  })

  it('extracts nested Anthropic API error messages from deserialized transcript records', () => {
    const error = createApiError(undefined, {
      status: 502,
      error: {
        error: {
          message:
            '<!DOCTYPE html><html><head><title>502 Bad Gateway</title></head></html>',
        },
      },
    })

    expect(formatAPIError(error)).toBe('502 Bad Gateway')
  })

  it('extracts nested Bedrock-style messages when top-level message is missing', () => {
    const error = createApiError(undefined, {
      status: 429,
      error: {
        message: 'rate limit exceeded',
      },
    })

    expect(formatAPIError(error)).toBe('rate limit exceeded')
  })

  it('returns the TLS intercept hint only for SSL-classified connection failures', () => {
    const sslError = createApiError('Connection error.', {
      cause: withCode('self signed cert', 'SELF_SIGNED_CERT_IN_CHAIN'),
    })
    const networkError = createApiError('Connection error.', {
      cause: withCode('socket hang up', 'ECONNRESET'),
    })

    const sslHint = getSSLErrorHint(sslError)

    expect(sslHint).toContain(
      'SSL certificate error (SELF_SIGNED_CERT_IN_CHAIN)',
    )
    expect(getSSLErrorHint(networkError)).toBeNull()
  })
})
