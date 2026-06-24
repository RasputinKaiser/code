import { describe, expect, it } from 'bun:test'
import { isUpgradeCommandEnabledForContext } from './index.js'

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

describe('/upgrade command gating', () => {
  it('is disabled when the env kill switch is set', () => {
    expect(
      isUpgradeCommandEnabledForContext({
        isDisabledByEnv: true,
        session: buildSession(),
      }),
    ).toBe(false)
  })

  it('is disabled for enterprise subscriptions', () => {
    expect(
      isUpgradeCommandEnabledForContext({
        isDisabledByEnv: false,
        session: buildSession({
          subscription: {
            subscriptionType: 'enterprise',
            rateLimitTier: null,
          },
        }),
      }),
    ).toBe(false)
  })

  it('stays enabled for non-enterprise sessions', () => {
    expect(
      isUpgradeCommandEnabledForContext({
        isDisabledByEnv: false,
        session: buildSession({
          subscription: {
            subscriptionType: 'pro',
            rateLimitTier: null,
          },
        }),
      }),
    ).toBe(true)

    expect(
      isUpgradeCommandEnabledForContext({
        isDisabledByEnv: false,
        session: buildSession(),
      }),
    ).toBe(true)
  })
})
