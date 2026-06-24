import { describe, expect, it } from 'bun:test'
import { buildRateLimitOptionsSessionState } from './rateLimitOptionsSession.js'

function buildManagedSession(overrides: Partial<any> = {}) {
  return {
    principalSource: 'managed_oauth',
    subscription: {
      subscriptionType: 'pro',
      rateLimitTier: 'tier-1',
    },
    ...overrides,
  }
}

describe('rate limit options canonical session state', () => {
  it('preserves managed subscription metadata and extra-usage state', () => {
    expect(
      buildRateLimitOptionsSessionState(buildManagedSession(), true),
    ).toEqual({
      hasExtraUsageEnabled: true,
      rateLimitTier: 'tier-1',
      subscriptionType: 'pro',
    })
  })

  it('clears extra-usage and subscription state for non-managed sessions', () => {
    expect(
      buildRateLimitOptionsSessionState(
        buildManagedSession({
          principalSource: 'direct_api_key_env',
        }),
        true,
      ),
    ).toEqual({
      hasExtraUsageEnabled: false,
      rateLimitTier: null,
      subscriptionType: null,
    })
  })

  it('clears state when no session exists', () => {
    expect(buildRateLimitOptionsSessionState(null, true)).toEqual({
      hasExtraUsageEnabled: false,
      rateLimitTier: null,
      subscriptionType: null,
    })
  })
})
