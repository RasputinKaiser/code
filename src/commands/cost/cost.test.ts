import { describe, expect, it } from 'bun:test'
import { buildCostCommandText } from './cost.js'

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

describe('/cost command output', () => {
  it('shows the managed subscription message for oauth-backed Noumena sessions', () => {
    expect(
      buildCostCommandText({
        session: buildSession({
          headersKind: 'bearer',
          providerPlan: { mode: 'noumena_managed' },
          scopes: ['user:inference'],
        }),
        totalCost: '$12.34',
        isUsingOverage: false,
        isInternalBuild: false,
      }),
    ).toContain('You are currently using your subscription to power your Code usage')
  })

  it('shows the managed overage message and internal cost suffix when applicable', () => {
    expect(
      buildCostCommandText({
        session: buildSession({
          headersKind: 'bearer',
          providerPlan: { mode: 'noumena_managed' },
          scopes: ['user:inference'],
        }),
        totalCost: '$12.34',
        isUsingOverage: true,
        isInternalBuild: true,
      }),
    ).toBe(
      'You are currently using your overages to power your Code usage. We will automatically switch you back to your subscription rate limits when they reset\n\n[NOUMENA-ONLY] Showing cost anyway:\n $12.34',
    )
  })

  it('shows raw total cost for non-oauth-backed sessions', () => {
    expect(
      buildCostCommandText({
        session: buildSession({
          headersKind: 'api_key',
          providerPlan: { mode: 'byok_static_env' },
        }),
        totalCost: '$12.34',
        isUsingOverage: true,
        isInternalBuild: false,
      }),
    ).toBe('$12.34')
  })
})
