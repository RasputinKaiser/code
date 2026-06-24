import { describe, expect, it } from 'bun:test'

import {
  INTERNAL_NOUMENA_GROWTHBOOK_API_HOST_EXAMPLE,
  deriveGrowthBookApiHost,
  isGrowthBookStagingHost,
  resolveGrowthBookApiHost,
} from './growthbookHost.js'

describe('deriveGrowthBookApiHost', () => {
  it('maps standard Noumena api hosts to the flags host', () => {
    expect(deriveGrowthBookApiHost('https://api.dev.noumena.test')).toBe(
      'https://flags.dev.noumena.test',
    )
    expect(deriveGrowthBookApiHost('https://api.noumena.com/')).toBe(
      'https://flags.noumena.com',
    )
  })

  it('preserves scheme and port for local-style api hosts', () => {
    expect(deriveGrowthBookApiHost('http://api.localtest.me:8080')).toBe(
      'http://flags.localtest.me:8080',
    )
  })

  it('leaves non-standard hosts unchanged', () => {
    expect(deriveGrowthBookApiHost('https://custom.example.com/platform')).toBe(
      'https://custom.example.com/platform',
    )
  })
})

describe('resolveGrowthBookApiHost', () => {
  it('prefers an explicit Noumena GrowthBook host override', () => {
    expect(
      resolveGrowthBookApiHost({
        noumenaOverride: ' https://flags.dev.noumena.test/ ',
        platformBaseUrl: 'https://api.dev.noumena.test',
      }),
    ).toBe('https://flags.dev.noumena.test')
  })

  it('preserves the ant legacy host override when present', () => {
    expect(
      resolveGrowthBookApiHost({
        legacyAnthropicOverride: ' https://growthbook.ant.example.com/ ',
        platformBaseUrl: 'https://api.dev.noumena.test',
      }),
    ).toBe('https://growthbook.ant.example.com')
  })

  it('derives the flags host from an explicit Noumena platform base url', () => {
    expect(
      resolveGrowthBookApiHost({
        platformBaseUrl: 'https://api.dev.noumena.test/',
      }),
    ).toBe('https://flags.dev.noumena.test')
  })

  it('does not provide a hardcoded public default', () => {
    expect(resolveGrowthBookApiHost({})).toBeUndefined()
  })
})

describe('isGrowthBookStagingHost', () => {
  it('identifies the known staging flags host', () => {
    expect(
      isGrowthBookStagingHost(INTERNAL_NOUMENA_GROWTHBOOK_API_HOST_EXAMPLE),
    ).toBe(true)
  })

  it('returns false for production-similar hosts', () => {
    expect(isGrowthBookStagingHost('https://flags.noumena.com')).toBe(false)
    expect(isGrowthBookStagingHost('https://flags.dev.noumena.test')).toBe(
      false,
    )
  })
})
