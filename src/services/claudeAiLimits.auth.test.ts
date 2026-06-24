import { describe, expect, it } from 'bun:test'
import { shouldProcessClaudeAiRateLimitsForSession } from './claudeAiLimits.js'

function makeSession(overrides: Partial<any> = {}) {
  return {
    providerPlan: {
      mode: 'noumena_managed',
    },
    headersKind: 'bearer',
    scopes: ['user:inference'],
    ...overrides,
  }
}

describe('claudeAiLimits canonical auth gating', () => {
  it('processes rate limits for oauth-backed first-party sessions', () => {
    expect(shouldProcessClaudeAiRateLimitsForSession(makeSession())).toBe(true)
  })

  it('preserves service bearer sessions as rate-limit eligible', () => {
    expect(
      shouldProcessClaudeAiRateLimitsForSession(
        makeSession({
          providerPlan: {
            mode: 'noumena_managed',
          },
          headersKind: 'bearer',
          scopes: ['user:inference'],
        }),
      ),
    ).toBe(true)
  })

  it('rejects direct api-key and static BYOK env-key sessions', () => {
    expect(
      shouldProcessClaudeAiRateLimitsForSession(
        makeSession({
          providerPlan: {
            mode: 'noumena_managed',
          },
          headersKind: 'api_key',
          scopes: [],
        }),
      ),
    ).toBe(false)

    expect(
      shouldProcessClaudeAiRateLimitsForSession(
        makeSession({
          providerPlan: {
            mode: 'byok_static_env',
          },
          headersKind: 'api_key',
          scopes: [],
        }),
      ),
    ).toBe(false)
  })
})
