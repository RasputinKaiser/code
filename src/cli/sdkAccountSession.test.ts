import { describe, expect, it } from 'bun:test'
import { buildSdkAccountInfo } from './sdkAccountSession.js'

describe('buildSdkAccountInfo', () => {
  it('returns undefined for non-first-party providers', () => {
    expect(
      buildSdkAccountInfo({
        apiProvider: 'bedrock',
        session: {
          principalSource: 'managed_oauth',
          sessionState: 'usable',
          subscription: {
            subscriptionName: 'Noumena Pro',
            subscriptionType: 'pro',
            rateLimitTier: 'tier_1',
          },
          identity: {
            email: 'user@noumena.test',
            accountUuid: null,
            organizationUuid: null,
            organizationName: 'Acme',
          },
          rawAuthTokenSource: null,
          rawApiKeySource: null,
          hasUsableApiKey: false,
        },
      }),
    ).toBeUndefined()
  })

  it('reports managed subscription and managed account context', () => {
    expect(
      buildSdkAccountInfo({
        apiProvider: 'firstParty',
        session: {
          principalSource: 'managed_oauth',
          sessionState: 'usable',
          subscription: {
            subscriptionName: 'Noumena Team',
            subscriptionType: 'team',
            rateLimitTier: 'tier_1',
          },
          identity: {
            email: 'user@noumena.test',
            accountUuid: null,
            organizationUuid: null,
            organizationName: 'Acme',
          },
          rawAuthTokenSource: 'noumena.com',
          rawApiKeySource: null,
          hasUsableApiKey: false,
        },
      }),
    ).toEqual({
      subscription: 'Noumena Team',
      organization: 'Acme',
      email: 'user@noumena.test',
    })
  })

  it('reports service bearer token sources directly', () => {
    expect(
      buildSdkAccountInfo({
        apiProvider: 'firstParty',
        session: {
          principalSource: 'service_oauth_env',
          sessionState: 'usable',
          subscription: {
            subscriptionName: null,
            subscriptionType: null,
            rateLimitTier: null,
          },
          identity: {
            email: null,
            accountUuid: null,
            organizationUuid: null,
            organizationName: null,
          },
          rawAuthTokenSource: 'CLAUDE_CODE_OAUTH_TOKEN',
          rawApiKeySource: null,
          hasUsableApiKey: false,
        },
      }),
    ).toEqual({
      tokenSource: 'CLAUDE_CODE_OAUTH_TOKEN',
    })
  })

  it('preserves managed key context for console key sessions', () => {
    expect(
      buildSdkAccountInfo({
        apiProvider: 'firstParty',
        session: {
          principalSource: 'console_api_key',
          sessionState: 'usable',
          subscription: {
            subscriptionName: null,
            subscriptionType: null,
            rateLimitTier: null,
          },
          identity: {
            email: 'user@noumena.test',
            accountUuid: null,
            organizationUuid: null,
            organizationName: 'Acme',
          },
          rawAuthTokenSource: null,
          rawApiKeySource: '/login managed key',
          hasUsableApiKey: true,
        },
      }),
    ).toEqual({
      tokenSource: 'none',
      apiKeySource: '/login managed key',
      organization: 'Acme',
      email: 'user@noumena.test',
    })
  })

  it('marks expired managed sessions explicitly', () => {
    expect(
      buildSdkAccountInfo({
        apiProvider: 'firstParty',
        session: {
          principalSource: 'managed_oauth',
          sessionState: 'expired',
          subscription: {
            subscriptionName: null,
            subscriptionType: null,
            rateLimitTier: null,
          },
          identity: {
            email: null,
            accountUuid: null,
            organizationUuid: null,
            organizationName: null,
          },
          rawAuthTokenSource: 'noumena.com',
          rawApiKeySource: null,
          hasUsableApiKey: false,
        },
      }),
    ).toEqual({
      subscription: 'Noumena Managed',
      authTokenExpired: true,
    })
  })
})
