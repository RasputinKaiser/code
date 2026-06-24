import { describe, expect, it } from 'bun:test'

import {
  getApiKeyHelperSlowNoticeDuration,
  hasConfiguredApiKeyHelper,
} from './apiKeyHelperSession.js'

describe('getApiKeyHelperSlowNoticeDuration', () => {
  it('returns null when apiKeyHelper is not configured', () => {
    expect(
      getApiKeyHelperSlowNoticeDuration({
        configured: false,
        elapsedMs: 20_000,
      }),
    ).toBeNull()
  })

  it('returns null before the slow-helper threshold', () => {
    expect(
      getApiKeyHelperSlowNoticeDuration({
        configured: true,
        elapsedMs: 9_999,
      }),
    ).toBeNull()
  })

  it('formats the elapsed duration at and above the slow-helper threshold', () => {
    expect(
      getApiKeyHelperSlowNoticeDuration({
        configured: true,
        elapsedMs: 10_000,
      }),
    ).toBe('10s')
  })

  it('keeps the configured-helper check boolean-shaped for UI/session gates', () => {
    expect(typeof hasConfiguredApiKeyHelper()).toBe('boolean')
  })
})
