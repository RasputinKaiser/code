import { describe, expect, it } from 'bun:test'
import {
  buildBridgeConnectUrl,
  buildBridgeSessionUrl,
  getBridgeStatus,
} from './bridgeStatusUtil.js'

describe('bridgeStatusUtil', () => {
  it('prefers the configured Noumena web host for bridge urls', () => {
    const original = process.env.NOUMENA_OAUTH_WEB_BASE_URL
    try {
      process.env.NOUMENA_OAUTH_WEB_BASE_URL =
        'https://console.dev.noumena.test/'

      expect(
        buildBridgeConnectUrl('env-1', 'https://bridge.staging.example'),
      ).toBe('https://code.dev.noumena.test/code?bridge=env-1')

      expect(buildBridgeSessionUrl('session_123', 'env-1')).toBe(
        'https://code.dev.noumena.test/code/session_123?bridge=env-1',
      )
    } finally {
      if (original === undefined) {
        delete process.env.NOUMENA_OAUTH_WEB_BASE_URL
      } else {
        process.env.NOUMENA_OAUTH_WEB_BASE_URL = original
      }
    }
  })

  it('builds the connect url against local and default app hosts inferred from ingress', () => {
    expect(
      buildBridgeConnectUrl('env-local', 'http://localhost:7681/bridge'),
    ).toBe('http://localhost:4000/code?bridge=env-local')

    expect(
      buildBridgeConnectUrl('env-dev', 'https://bridge.dev.example'),
    ).toBe('https://code.noumena.com/code?bridge=env-dev')
  })

  it('builds the attached-session url with compat session ids and the bridge query parameter', () => {
    expect(
      buildBridgeSessionUrl(
        'cse_12345678-1234-1234-1234-1234567890ab',
        'env-1',
      ),
    ).toBe(
      'https://code.noumena.com/code/session_12345678-1234-1234-1234-1234567890ab?bridge=env-1',
    )
  })

  it('gives error state precedence over reconnecting and active signals', () => {
    expect(
      getBridgeStatus({
        error: 'connection lost',
        connected: true,
        sessionActive: true,
        reconnecting: true,
      }),
    ).toEqual({
      label: 'Remote Control failed',
      color: 'error',
    })
  })

  it('distinguishes reconnecting, active, and connecting states when no error is present', () => {
    expect(
      getBridgeStatus({
        error: undefined,
        connected: false,
        sessionActive: false,
        reconnecting: true,
      }),
    ).toEqual({
      label: 'Remote Control reconnecting',
      color: 'warning',
    })

    expect(
      getBridgeStatus({
        error: undefined,
        connected: true,
        sessionActive: false,
        reconnecting: false,
      }),
    ).toEqual({
      label: 'Remote Control active',
      color: 'success',
    })

    expect(
      getBridgeStatus({
        error: undefined,
        connected: false,
        sessionActive: false,
        reconnecting: false,
      }),
    ).toEqual({
      label: 'Remote Control connecting…',
      color: 'warning',
    })
  })
})
