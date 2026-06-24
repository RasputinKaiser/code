import { afterEach, describe, expect, it } from 'bun:test'

import {
  setCseShimGate,
  toCompatSessionId,
  toInfraSessionId,
} from './sessionIdCompat.js'

afterEach(() => {
  setCseShimGate(() => true)
})

describe('sessionIdCompat', () => {
  it('retags cse session ids for compat-facing APIs when the shim is enabled', () => {
    expect(toCompatSessionId('cse_1234abcd')).toBe('session_1234abcd')
    expect(toCompatSessionId('cse_staging_1234abcd')).toBe(
      'session_staging_1234abcd',
    )
    expect(toCompatSessionId('session_1234abcd')).toBe('session_1234abcd')
  })

  it('respects the injected cse shim kill switch', () => {
    setCseShimGate(() => false)
    expect(toCompatSessionId('cse_1234abcd')).toBe('cse_1234abcd')

    setCseShimGate(() => true)
    expect(toCompatSessionId('cse_1234abcd')).toBe('session_1234abcd')
  })

  it('retags compat session ids back to infra ids without disturbing non-session ids', () => {
    expect(toInfraSessionId('session_1234abcd')).toBe('cse_1234abcd')
    expect(toInfraSessionId('session_local_1234abcd')).toBe(
      'cse_local_1234abcd',
    )
    expect(toInfraSessionId('cse_1234abcd')).toBe('cse_1234abcd')
  })
})
