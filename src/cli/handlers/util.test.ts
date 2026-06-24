import { describe, expect, it } from 'bun:test'

import { shouldWarnSetupTokenForPrincipalSource } from './util.js'

describe('shouldWarnSetupTokenForPrincipalSource', () => {
  it('warns for external env and helper-backed principals', () => {
    expect(shouldWarnSetupTokenForPrincipalSource('direct_api_key_env')).toBe(
      true,
    )
    expect(shouldWarnSetupTokenForPrincipalSource('api_key_helper')).toBe(true)
    expect(
      shouldWarnSetupTokenForPrincipalSource('external_bearer_compat'),
    ).toBe(true)
    expect(shouldWarnSetupTokenForPrincipalSource('service_oauth_env')).toBe(
      true,
    )
    expect(shouldWarnSetupTokenForPrincipalSource('service_oauth_fd')).toBe(
      true,
    )
    expect(
      shouldWarnSetupTokenForPrincipalSource('service_api_key_fd'),
    ).toBe(true)
  })

  it('does not warn for managed, console, third-party, or missing principals', () => {
    expect(shouldWarnSetupTokenForPrincipalSource('managed_oauth')).toBe(false)
    expect(shouldWarnSetupTokenForPrincipalSource('console_api_key')).toBe(
      false,
    )
    expect(shouldWarnSetupTokenForPrincipalSource('third_party_provider')).toBe(
      false,
    )
    expect(shouldWarnSetupTokenForPrincipalSource('none')).toBe(false)
  })
})
