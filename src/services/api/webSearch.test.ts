import { afterEach, describe, expect, it } from 'bun:test'
import { getNoumenaWebSearchBaseUrl } from './webSearch.js'

const envKeys = [
  'NOUMENA_WEB_SEARCH_BASE_URL',
  'NOUMENA_PLATFORM_BASE_URL',
] as const
const originalEnv = Object.fromEntries(
  envKeys.map(key => [key, process.env[key]]),
) as Record<(typeof envKeys)[number], string | undefined>

afterEach(() => {
  for (const key of envKeys) {
    const value = originalEnv[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
})

describe('getNoumenaWebSearchBaseUrl', () => {
  it('uses the explicit WebSearch base URL when configured', () => {
    process.env.NOUMENA_WEB_SEARCH_BASE_URL = 'https://search.dev.noumena.test/'
    process.env.NOUMENA_PLATFORM_BASE_URL = 'https://api.dev.noumena.test'

    expect(getNoumenaWebSearchBaseUrl()).toBe('https://search.dev.noumena.test/')
  })

  it('defaults WebSearch to the platform API base, not the raw model base', () => {
    delete process.env.NOUMENA_WEB_SEARCH_BASE_URL
    process.env.NOUMENA_PLATFORM_BASE_URL = 'https://api.dev.noumena.test/'

    expect(getNoumenaWebSearchBaseUrl()).toBe('https://api.dev.noumena.test')
  })
})
