import { describe, expect, it } from 'bun:test'
import { isRateLimitOptionsEnabledForContext } from './index.js'

function buildSession(overrides: Partial<any> = {}) {
  return {
    headersKind: 'none',
    providerPlan: {
      mode: 'none',
    },
    scopes: [],
    subscription: {
      subscriptionType: null,
      rateLimitTier: null,
    },
    ...overrides,
  }
}

describe('/rate-limit-options command gating', () => {
  it('is enabled for oauth-backed Noumena sessions', () => {
    expect(
      isRateLimitOptionsEnabledForContext(
        buildSession({
          headersKind: 'bearer',
          providerPlan: { mode: 'noumena_managed' },
          scopes: ['user:inference'],
        }),
      ),
    ).toBe(true)
  })

  it('is disabled for api-key and third-party sessions', () => {
    expect(
      isRateLimitOptionsEnabledForContext(
        buildSession({
          headersKind: 'api_key',
          providerPlan: { mode: 'byok_static_env' },
        }),
      ),
    ).toBe(false)

    expect(
      isRateLimitOptionsEnabledForContext(
        buildSession({
          headersKind: 'bearer',
          providerPlan: { mode: 'third_party_provider' },
          scopes: ['user:inference'],
        }),
      ),
    ).toBe(false)
  })
})
