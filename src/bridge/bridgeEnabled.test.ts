import { describe, expect, it } from 'bun:test'
import {
  getBridgeEligibilityPreGateReason,
  hasManagedBridgePrincipal,
  type BridgeEligibilitySession,
} from './bridgeEnabled.js'

function makeSession(
  overrides: Partial<NonNullable<BridgeEligibilitySession>> = {},
): NonNullable<BridgeEligibilitySession> {
  return {
    principalSource: 'managed_oauth',
    scopes: ['user:inference', 'user:profile'],
    identity: {
      organizationUuid: 'org-123',
    },
    ...overrides,
  }
}

describe('bridgeEnabled canonical runtime helpers', () => {
  it('treats managed oauth with inference scope as a bridge-eligible principal', () => {
    expect(hasManagedBridgePrincipal(makeSession())).toBe(true)
  })

  it('rejects non-managed principals for bridge eligibility', () => {
    expect(
      hasManagedBridgePrincipal(
        makeSession({
          principalSource: 'direct_api_key_env',
        }),
      ),
    ).toBe(false)
  })

  it('returns the managed-account message when no canonical principal exists', () => {
    expect(getBridgeEligibilityPreGateReason(null)).toBe(
      'Remote Control requires a managed Noumena account. Run `code auth login` to sign in with your Noumena account.',
    )
  })

  it('returns the full-scope message when profile scope is missing', () => {
    const reason = getBridgeEligibilityPreGateReason(
      makeSession({
        scopes: ['user:inference'],
      }),
    )
    expect(reason).toContain('Remote Control requires a full-scope login token.')
    expect(reason).toContain(
      'Run `code auth login` to use Remote Control.',
    )
  })

  it('returns the organization message when canonical account metadata is incomplete', () => {
    expect(
      getBridgeEligibilityPreGateReason(
        makeSession({
          identity: {
            organizationUuid: null,
          },
        }),
      ),
    ).toBe(
      'Unable to determine your organization for Remote Control eligibility. Run `code auth login` to refresh your account information.',
    )
  })

  it('returns null when the canonical managed session is fully bridge-eligible', () => {
    expect(getBridgeEligibilityPreGateReason(makeSession())).toBeNull()
  })
})
