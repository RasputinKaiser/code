import { describe, expect, it } from 'bun:test'
import { getSystemInitApiKeySourceForSession } from './systemInitSession.js'

describe('systemInitSession', () => {
  it('preserves canonical api-key source labels from the current session', () => {
    expect(
      getSystemInitApiKeySourceForSession({
        rawApiKeySource: 'NOUMENA_API_KEY',
      }),
    ).toBe('NOUMENA_API_KEY')
    expect(
      getSystemInitApiKeySourceForSession({
        rawApiKeySource: 'apiKeyHelper',
      }),
    ).toBe('apiKeyHelper')
    expect(
      getSystemInitApiKeySourceForSession({
        rawApiKeySource: '/login managed key',
      }),
    ).toBe('/login managed key')
  })

  it('falls back to none when the canonical session has no api key source', () => {
    expect(getSystemInitApiKeySourceForSession(null)).toBe('none')
    expect(getSystemInitApiKeySourceForSession({ rawApiKeySource: null })).toBe(
      'none',
    )
  })
})
