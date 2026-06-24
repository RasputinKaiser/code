import { describe, expect, it, mock } from 'bun:test'
import { isHighestManagedMaxPlanForSession } from './upgrade.js'

function buildManagedSession(overrides: Partial<any> = {}) {
  return {
    principalSource: 'managed_oauth',
    sessionState: 'usable',
    accessToken: 'managed-token',
    subscription: {
      subscriptionType: null,
      rateLimitTier: null,
    },
    ...overrides,
  }
}

describe('/upgrade max-plan detection', () => {
  it('returns true from canonical subscription metadata without a profile lookup', async () => {
    const fetchProfile = mock(async () => undefined)

    await expect(
      isHighestManagedMaxPlanForSession(
        buildManagedSession({
          subscription: {
            subscriptionType: 'max',
            rateLimitTier: 'default_claude_max_20x',
          },
        }),
        fetchProfile,
      ),
    ).resolves.toBe(true)

    expect(fetchProfile).not.toHaveBeenCalled()
  })

  it('falls back to the oauth profile lookup for usable managed sessions with missing metadata', async () => {
    const fetchProfile = mock(async () => ({
      organization: {
        organization_type: 'claude_max',
        rate_limit_tier: 'default_claude_max_20x',
      },
    }))

    await expect(
      isHighestManagedMaxPlanForSession(buildManagedSession(), fetchProfile),
    ).resolves.toBe(true)

    expect(fetchProfile).toHaveBeenCalledTimes(1)
    expect(fetchProfile).toHaveBeenCalledWith('managed-token')
  })

  it('does not do a remote profile lookup for expired managed sessions', async () => {
    const fetchProfile = mock(async () => ({
      organization: {
        organization_type: 'claude_max',
        rate_limit_tier: 'default_claude_max_20x',
      },
    }))

    await expect(
      isHighestManagedMaxPlanForSession(
        buildManagedSession({
          sessionState: 'expired',
        }),
        fetchProfile,
      ),
    ).resolves.toBe(false)

    expect(fetchProfile).not.toHaveBeenCalled()
  })

  it('returns false for missing or non-managed sessions', async () => {
    await expect(isHighestManagedMaxPlanForSession(null)).resolves.toBe(false)
    await expect(
      isHighestManagedMaxPlanForSession({
        principalSource: 'service_oauth_env',
        sessionState: 'usable',
        accessToken: 'service-token',
        subscription: {
          subscriptionType: 'max',
          rateLimitTier: 'default_claude_max_20x',
        },
      }),
    ).resolves.toBe(false)
  })
})
