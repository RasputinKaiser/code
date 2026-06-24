import { describe, expect, test } from 'bun:test'

import {
  hasManagedPlanBillingAccessForSession,
  hasConsoleBillingAccessForSession,
} from './billing.js'

describe('hasConsoleBillingAccessForSession', () => {
  test('allows first-party non-subscriber sessions with org or workspace billing roles', () => {
    expect(
      hasConsoleBillingAccessForSession(
        {
          principalKind: 'noumena_account',
          providerAuthKind: 'noumena_first_party',
          subscription: {
            subscriptionType: null,
          },
        },
        {
          organizationRole: 'billing',
          workspaceRole: null,
        },
      ),
    ).toBe(true)

    expect(
      hasConsoleBillingAccessForSession(
        {
          principalKind: 'api_key_user',
          providerAuthKind: 'noumena_first_party',
          subscription: {
            subscriptionType: null,
          },
        },
        {
          organizationRole: null,
          workspaceRole: 'workspace_billing',
        },
      ),
    ).toBe(true)
  })

  test('rejects third-party, subscriber, and role-less sessions', () => {
    expect(
      hasConsoleBillingAccessForSession(
        {
          principalKind: 'third_party_provider',
          providerAuthKind: 'third_party_provider',
          subscription: {
            subscriptionType: null,
          },
        },
        {
          organizationRole: 'billing',
          workspaceRole: 'workspace_billing',
        },
      ),
    ).toBe(false)

    expect(
      hasConsoleBillingAccessForSession(
        {
          principalKind: 'noumena_account',
          providerAuthKind: 'noumena_first_party',
          subscription: {
            subscriptionType: 'team',
          },
        },
        {
          organizationRole: 'billing',
          workspaceRole: 'workspace_billing',
        },
      ),
    ).toBe(false)

    expect(
      hasConsoleBillingAccessForSession(
        {
          principalKind: 'noumena_account',
          providerAuthKind: 'noumena_first_party',
          subscription: {
            subscriptionType: null,
          },
        },
        {
          organizationRole: null,
          workspaceRole: null,
        },
      ),
    ).toBe(false)
  })
})

describe('hasManagedPlanBillingAccessForSession', () => {
  test('allows usable managed Max/Pro sessions directly', () => {
    expect(
      hasManagedPlanBillingAccessForSession(
        {
          principalSource: 'managed_oauth',
          sessionState: 'usable',
          subscription: {
            subscriptionType: 'max',
          },
        },
        {
          organizationRole: null,
        },
      ),
    ).toBe(true)

    expect(
      hasManagedPlanBillingAccessForSession(
        {
          principalSource: 'managed_oauth',
          sessionState: 'usable',
          subscription: {
            subscriptionType: 'pro',
          },
        },
        {
          organizationRole: null,
        },
      ),
    ).toBe(true)
  })

  test('requires billing/admin role for team and enterprise sessions', () => {
    expect(
      hasManagedPlanBillingAccessForSession(
        {
          principalSource: 'managed_oauth',
          sessionState: 'usable',
          subscription: {
            subscriptionType: 'team',
          },
        },
        {
          organizationRole: 'billing',
        },
      ),
    ).toBe(true)

    expect(
      hasManagedPlanBillingAccessForSession(
        {
          principalSource: 'managed_oauth',
          sessionState: 'usable',
          subscription: {
            subscriptionType: 'enterprise',
          },
        },
        {
          organizationRole: 'member',
        },
      ),
    ).toBe(false)
  })

  test('rejects non-managed, expired, or subscription-less sessions', () => {
    expect(
      hasManagedPlanBillingAccessForSession(
        {
          principalSource: 'direct_api_key_env',
          sessionState: 'usable',
          subscription: {
            subscriptionType: 'max',
          },
        },
        {
          organizationRole: 'billing',
        },
      ),
    ).toBe(false)

    expect(
      hasManagedPlanBillingAccessForSession(
        {
          principalSource: 'managed_oauth',
          sessionState: 'expired',
          subscription: {
            subscriptionType: 'max',
          },
        },
        {
          organizationRole: 'billing',
        },
      ),
    ).toBe(false)

    expect(
      hasManagedPlanBillingAccessForSession(
        {
          principalSource: 'managed_oauth',
          sessionState: 'usable',
          subscription: {
            subscriptionType: null,
          },
        },
        {
          organizationRole: 'billing',
        },
      ),
    ).toBe(false)
  })
})
