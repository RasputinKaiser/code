import { describe, expect, it } from 'bun:test'
import { buildChannelNotificationAuthState } from './channelNotification.js'

function makeSession(overrides: Partial<any> = {}) {
  return {
    providerPlan: {
      mode: 'noumena_managed',
    },
    headersKind: 'bearer',
    scopes: ['user:inference'],
    subscription: {
      subscriptionType: 'team',
    },
    ...overrides,
  }
}

describe('channel notification canonical auth helpers', () => {
  it('treats oauth-backed managed team sessions as managed channel sessions', () => {
    expect(buildChannelNotificationAuthState(makeSession())).toEqual({
      hasOauthChannelSession: true,
      subscriptionType: 'team',
      isManagedTeamOrEnterprise: true,
    })
  })

  it('preserves service bearer sessions without managed team policy gating', () => {
    expect(
      buildChannelNotificationAuthState(
        makeSession({
          subscription: {
            subscriptionType: null,
          },
        }),
      ),
    ).toEqual({
      hasOauthChannelSession: true,
      subscriptionType: null,
      isManagedTeamOrEnterprise: false,
    })
  })

  it('rejects direct api-key and static BYOK env-key sessions', () => {
    expect(
      buildChannelNotificationAuthState(
        makeSession({
          providerPlan: {
            mode: 'noumena_managed',
          },
          headersKind: 'api_key',
          scopes: [],
          subscription: {
            subscriptionType: null,
          },
        }),
      ),
    ).toEqual({
      hasOauthChannelSession: false,
      subscriptionType: null,
      isManagedTeamOrEnterprise: false,
    })

    expect(
      buildChannelNotificationAuthState(
        makeSession({
          providerPlan: {
            mode: 'byok_static_env',
          },
          headersKind: 'api_key',
          scopes: [],
          subscription: {
            subscriptionType: null,
          },
        }),
      ),
    ).toEqual({
      hasOauthChannelSession: false,
      subscriptionType: null,
      isManagedTeamOrEnterprise: false,
    })
  })
})
