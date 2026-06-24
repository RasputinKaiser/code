import { describe, expect, it } from 'bun:test'
import {
  createTokenRefreshScheduler,
  decodeJwtExpiry,
  decodeJwtPayload,
} from './jwtUtils.js'

function createJwt(exp: number, extra: Record<string, unknown> = {}): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
    'base64url',
  )
  const payload = Buffer.from(JSON.stringify({ exp, ...extra })).toString(
    'base64url',
  )
  return `${header}.${payload}.signature`
}

async function waitUntil(predicate: () => boolean, timeoutMs = 100): Promise<void> {
  const started = Date.now()
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error('Timed out waiting for condition')
    }
    await Bun.sleep(1)
  }
}

describe('jwtUtils', () => {
  it('decodes JWT payloads and expiry, including session-ingress prefixed tokens', () => {
    const token = createJwt(1_700_000_000, { sub: 'session-1' })

    expect(decodeJwtPayload(`sk-ant-si-${token}`)).toEqual({
      exp: 1_700_000_000,
      sub: 'session-1',
    })
    expect(decodeJwtExpiry(token)).toBe(1_700_000_000)
  })

  it('refreshes immediately when a token is already inside the refresh buffer', async () => {
    const refreshes: string[] = []
    const scheduler = createTokenRefreshScheduler({
      getAccessToken: () => 'oauth-refresh-token',
      onRefresh: sessionId => {
        refreshes.push(sessionId)
      },
      label: 'test',
    })

    scheduler.schedule(
      'session-1',
      createJwt(Math.floor((Date.now() + 1000) / 1000)),
    )

    await waitUntil(() => refreshes.length === 1)
    scheduler.cancelAll()

    expect(refreshes).toEqual(['session-1'])
  })

  it('drops stale in-flight refreshes after cancel', async () => {
    const refreshes: string[] = []
    let resolveToken: ((token: string | undefined) => void) | undefined
    const scheduler = createTokenRefreshScheduler({
      getAccessToken: () =>
        new Promise<string | undefined>(resolve => {
          resolveToken = resolve
        }),
      onRefresh: sessionId => {
        refreshes.push(sessionId)
      },
      label: 'test',
    })

    scheduler.schedule(
      'session-2',
      createJwt(Math.floor((Date.now() + 1000) / 1000)),
    )
    scheduler.cancel('session-2')
    resolveToken?.('oauth-late-token')

    await Bun.sleep(10)
    scheduler.cancelAll()

    expect(refreshes).toEqual([])
  })

  it('uses a 30s minimum delay when scheduling from expires_in', () => {
    const originalSetTimeout = globalThis.setTimeout
    const originalClearTimeout = globalThis.clearTimeout
    const scheduledDelays: number[] = []

    globalThis.setTimeout = ((handler: TimerHandler, timeout?: number) => {
      scheduledDelays.push(timeout ?? 0)
      return { fake: true } as unknown as ReturnType<typeof setTimeout>
    }) as typeof setTimeout
    globalThis.clearTimeout = (() => {}) as typeof clearTimeout

    try {
      const scheduler = createTokenRefreshScheduler({
        getAccessToken: () => 'oauth-refresh-token',
        onRefresh: () => {},
        label: 'test',
        refreshBufferMs: 60_000,
      })

      scheduler.scheduleFromExpiresIn('session-3', 1)

      expect(scheduledDelays).toEqual([30_000])
      scheduler.cancelAll()
    } finally {
      globalThis.setTimeout = originalSetTimeout
      globalThis.clearTimeout = originalClearTimeout
    }
  })

  it('keeps an existing scheduled timer when schedule receives a non-JWT token', () => {
    const originalSetTimeout = globalThis.setTimeout
    const originalClearTimeout = globalThis.clearTimeout
    let scheduledCount = 0
    let clearedCount = 0

    globalThis.setTimeout = ((handler: TimerHandler, timeout?: number) => {
      scheduledCount += 1
      return { fake: true, timeout } as unknown as ReturnType<typeof setTimeout>
    }) as typeof setTimeout
    globalThis.clearTimeout = (() => {
      clearedCount += 1
    }) as typeof clearTimeout

    try {
      const scheduler = createTokenRefreshScheduler({
        getAccessToken: () => 'oauth-refresh-token',
        onRefresh: () => {},
        label: 'test',
      })

      scheduler.scheduleFromExpiresIn('session-4', 120)
      scheduler.schedule('session-4', 'not-a-jwt')

      expect(scheduledCount).toBe(1)
      expect(clearedCount).toBe(0)
      scheduler.cancelAll()
    } finally {
      globalThis.setTimeout = originalSetTimeout
      globalThis.clearTimeout = originalClearTimeout
    }
  })
})
