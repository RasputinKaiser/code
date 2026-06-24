import { afterEach, describe, expect, it } from 'bun:test'
import { WebSocketTransport } from './WebSocketTransport.js'

let pendingTimer: ReturnType<typeof setTimeout> | null = null

describe('WebSocketTransport auth header refresh', () => {
  afterEach(() => {
    if (pendingTimer) {
      clearTimeout(pendingTimer)
      pendingTimer = null
    }
  })

  it('treats cookie-based session-ingress auth changes as refreshable after a 4003 close', () => {
    const transport = new WebSocketTransport(
      new URL('wss://api.dev.noumena.test/v1/session_ingress/ws/session-1'),
      {
        Cookie: 'sessionKey=stale-cookie',
      },
      undefined,
      () => ({
        Cookie: 'sessionKey=fresh-cookie',
        'X-Organization-Uuid': 'org-cookie',
      }),
    ) as any

    transport.state = 'connected'
    transport.doDisconnect = () => {}
    transport.connect = async () => {}

    transport.handleConnectionError(4003)

    expect(transport.headers).toMatchObject({
      Cookie: 'sessionKey=fresh-cookie',
      'X-Organization-Uuid': 'org-cookie',
    })
    expect(transport.state).toBe('reconnecting')

    if (transport.reconnectTimer) {
      pendingTimer = transport.reconnectTimer
      clearTimeout(pendingTimer)
      transport.reconnectTimer = null
    }
  })
})
