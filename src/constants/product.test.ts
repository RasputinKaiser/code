import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { getCodeWebBaseUrl, getRemoteSessionUrl } from './product.js'

const envKeys = [
  'NOUMENA_ISSUER_BASE_URL',
  'NOUMENA_OAUTH_WEB_BASE_URL',
] as const

const originalEnv = Object.fromEntries(
  envKeys.map(key => [key, process.env[key]]),
) as Record<(typeof envKeys)[number], string | undefined>

function resetEnv() {
  for (const key of envKeys) {
    const value = originalEnv[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

beforeEach(() => {
  resetEnv()
})

afterEach(() => {
  resetEnv()
})

describe('product remote urls', () => {
  it('defaults remote session urls to the noumena code web host', () => {
    delete process.env.NOUMENA_ISSUER_BASE_URL
    delete process.env.NOUMENA_OAUTH_WEB_BASE_URL

    expect(getCodeWebBaseUrl()).toBe('https://code.noumena.com')
    expect(
      getRemoteSessionUrl('019d9a47-0f2c-7e00-b231-9196365f93c0'),
    ).toBe(
      'https://code.noumena.com/code/019d9a47-0f2c-7e00-b231-9196365f93c0',
    )
  })

  it('prefers the configured Noumena web base for remote session urls', () => {
    process.env.NOUMENA_OAUTH_WEB_BASE_URL =
      'https://code.dev.noumena.test/'

    expect(getCodeWebBaseUrl()).toBe('https://code.dev.noumena.test')
    expect(
      getRemoteSessionUrl('019d9a47-0f2c-7e00-b231-9196365f93c0'),
    ).toBe(
      'https://code.dev.noumena.test/code/019d9a47-0f2c-7e00-b231-9196365f93c0',
    )
  })

  it('derives the Noumena web base from the issuer when no explicit web base is set', () => {
    process.env.NOUMENA_ISSUER_BASE_URL = 'https://api.dev.noumena.test'

    expect(getCodeWebBaseUrl()).toBe('https://code.dev.noumena.test')
    expect(
      getRemoteSessionUrl('019d9a47-0f2c-7e00-b231-9196365f93c0'),
    ).toBe(
      'https://code.dev.noumena.test/code/019d9a47-0f2c-7e00-b231-9196365f93c0',
    )
  })
})
