import { describe, expect, it } from 'bun:test'
import { isCostCommandHiddenForContext } from './index.js'

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

describe('/cost command visibility', () => {
  it('stays visible for internal builds', () => {
    expect(
      isCostCommandHiddenForContext({
        isInternalBuild: true,
        session: buildSession({
          headersKind: 'bearer',
          providerPlan: { mode: 'noumena_managed' },
          scopes: ['user:inference'],
        }),
      }),
    ).toBe(false)
  })

  it('hides for oauth-backed Noumena sessions outside internal builds', () => {
    expect(
      isCostCommandHiddenForContext({
        isInternalBuild: false,
        session: buildSession({
          headersKind: 'bearer',
          providerPlan: { mode: 'noumena_managed' },
          scopes: ['user:inference'],
        }),
      }),
    ).toBe(true)
  })

  it('stays visible for api-key sessions', () => {
    expect(
      isCostCommandHiddenForContext({
        isInternalBuild: false,
        session: buildSession({
          headersKind: 'api_key',
          providerPlan: { mode: 'byok_static_env' },
        }),
      }),
    ).toBe(false)
  })
})
