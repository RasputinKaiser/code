import { describe, expect, it } from 'bun:test'
import { hasChromeCommandAccessForSession } from './chromeAvailability.js'

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

describe('/chrome command access', () => {
  it('allows oauth-backed Noumena first-party sessions', () => {
    expect(
      hasChromeCommandAccessForSession(
        buildSession({
          headersKind: 'bearer',
          providerPlan: { mode: 'noumena_managed' },
          scopes: ['user:inference'],
        }),
      ),
    ).toBe(true)
  })

  it('rejects api-key and third-party sessions', () => {
    expect(
      hasChromeCommandAccessForSession(
        buildSession({
          headersKind: 'api_key',
          providerPlan: { mode: 'byok_static_env' },
        }),
      ),
    ).toBe(false)

    expect(
      hasChromeCommandAccessForSession(
        buildSession({
          headersKind: 'bearer',
          providerPlan: { mode: 'third_party_provider' },
          scopes: ['user:inference'],
        }),
      ),
    ).toBe(false)
  })
})
