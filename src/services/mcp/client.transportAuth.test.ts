import { beforeEach, describe, expect, it, mock } from 'bun:test'

let mockedSessionIngressHeaders: Record<string, string> = {}

const sessionIngressPaths = [
  import.meta.resolve('../../utils/sessionIngressAuth.ts'),
  import.meta.resolve('../../utils/sessionIngressAuth.js'),
]
const actualSessionIngressAuth = await import(
  import.meta.resolve('../../utils/sessionIngressAuth.ts')
)

for (const sessionIngressPath of sessionIngressPaths) {
  mock.module(sessionIngressPath, () => ({
    ...actualSessionIngressAuth,
    getSessionIngressAuthHeaders() {
      return mockedSessionIngressHeaders
    },
  }))
}

const { getMcpSessionIngressTransportHeaders } = await import('./client.ts')

beforeEach(() => {
  mockedSessionIngressHeaders = {}
})

describe('getMcpSessionIngressTransportHeaders', () => {
  it('returns no transport headers when there is no explicit session-ingress auth', () => {
    expect(getMcpSessionIngressTransportHeaders()).toEqual({})
  })

  it('preserves explicit cookie-based session-ingress auth headers', () => {
    mockedSessionIngressHeaders = {
      Cookie: 'sessionKey=sk-ant-sid-cookie-token',
      'X-Organization-Uuid': 'org-cookie',
    }

    expect(getMcpSessionIngressTransportHeaders()).toEqual({
      Cookie: 'sessionKey=sk-ant-sid-cookie-token',
      'X-Organization-Uuid': 'org-cookie',
    })
  })

  it('omits session-ingress transport headers when server oauth should take precedence', () => {
    mockedSessionIngressHeaders = {
      Authorization: 'Bearer session-token',
    }

    expect(
      getMcpSessionIngressTransportHeaders({
        includeWhenServerHasOAuthTokens: false,
      }),
    ).toEqual({})
  })
})
