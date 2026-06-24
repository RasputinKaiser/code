import { afterEach, describe, expect, it } from 'bun:test'
import { getPreflightEndpoints } from './preflightChecks.js'

const originalNoumenaPlatformBaseUrl = process.env.NOUMENA_PLATFORM_BASE_URL
const originalNoumenaIssuerBaseUrl = process.env.NOUMENA_ISSUER_BASE_URL

afterEach(() => {
  delete process.env.NOUMENA_PLATFORM_BASE_URL
  delete process.env.NOUMENA_ISSUER_BASE_URL

  if (originalNoumenaPlatformBaseUrl) {
    process.env.NOUMENA_PLATFORM_BASE_URL = originalNoumenaPlatformBaseUrl
  }
  if (originalNoumenaIssuerBaseUrl) {
    process.env.NOUMENA_ISSUER_BASE_URL = originalNoumenaIssuerBaseUrl
  }
})

describe('getPreflightEndpoints', () => {
  it('prefers explicit Noumena platform and issuer overrides', () => {
    process.env.NOUMENA_PLATFORM_BASE_URL = 'https://platform-api.noumena.test/'
    process.env.NOUMENA_ISSUER_BASE_URL = 'https://issuer.noumena.test/'

    expect(getPreflightEndpoints()).toEqual([
      'https://platform-api.noumena.test/healthz',
      'https://issuer.noumena.test/.well-known/jwks.json',
    ])
  })
})
