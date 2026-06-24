import { describe, expect, it } from 'bun:test'
import { isBilledAsExtraUsageForSession } from './extraUsage.js'

function makeSession(overrides: Partial<any> = {}) {
  return {
    headersKind: 'bearer',
    providerPlan: {
      mode: 'noumena_managed',
    },
    scopes: ['user:inference'],
    ...overrides,
  }
}

describe('extra usage canonical session helpers', () => {
  it('preserves oauth-backed fast-mode billing behavior', () => {
    expect(
      isBilledAsExtraUsageForSession(makeSession(), 'sonnet', true, false),
    ).toBe(true)
  })

  it('does not bill direct api-key or BYOK sessions as extra usage', () => {
    expect(
      isBilledAsExtraUsageForSession(
        makeSession({
          headersKind: 'api_key',
          providerPlan: { mode: 'noumena_managed' },
          scopes: [],
        }),
        'opus',
        false,
        false,
      ),
    ).toBe(false)

    expect(
      isBilledAsExtraUsageForSession(
        makeSession({
          headersKind: 'api_key',
          providerPlan: { mode: 'byok_static_env' },
          scopes: [],
        }),
        'opus',
        false,
        false,
      ),
    ).toBe(false)
  })

  it('preserves opus and sonnet 4.6 billing behavior for oauth-backed sessions', () => {
    expect(
      isBilledAsExtraUsageForSession(makeSession(), 'opus [1m]', false, false),
    ).toBe(true)
    expect(
      isBilledAsExtraUsageForSession(
        makeSession(),
        'sonnet [1m]',
        false,
        false,
      ),
    ).toBe(true)
    expect(
      isBilledAsExtraUsageForSession(makeSession(), 'opus [1m]', false, true),
    ).toBe(false)
  })
})
