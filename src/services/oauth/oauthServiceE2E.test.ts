import { afterEach, describe, expect, it } from 'bun:test'
import { getOauthSuccessUrl } from '../../constants/oauth.js'
import { OAuthService } from './index.js'
import {
  createMockOauthServer,
  withMockOauthEnvironment,
  type MockOauthServer,
} from './oauthTestHarness.js'

const liveServers: MockOauthServer[] = []

afterEach(async () => {
  while (liveServers.length > 0) {
    await liveServers.pop()!.close()
  }
})

describe('OAuthService end-to-end', () => {
  it('completes the automatic localhost callback flow against a real mock issuer', async () => {
    const server = await createMockOauthServer()
    liveServers.push(server)

    await withMockOauthEnvironment(server, async () => {
      const oauthService = new OAuthService()
      try {
        const tokensPromise = oauthService.startOAuthFlow(
          async (_manualUrl, automaticUrl) => {
            expect(automaticUrl).toBeDefined()
            const completed = await server.completeAutomaticFlow(automaticUrl!)
            expect(completed.code).toBe('auth-code-1')
            expect(completed.state).toBeTruthy()
            expect(completed.callbackUrl).toContain('http://localhost:')
            expect(completed.successLocation).toBe(
              `${server.webBaseUrl}/oauth/code/success?app=noumena-code`,
            )
          },
          {
            skipBrowserOpen: true,
          },
        )

        await expect(tokensPromise).resolves.toMatchObject({
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          subscriptionType: 'max',
          rateLimitTier: 'tier_1',
          tokenAccount: {
            uuid: 'acct-test',
            emailAddress: 'dev@noumena.test',
            organizationUuid: 'org-test',
          },
        })

        expect(server.tokenRequests).toHaveLength(1)
        expect(server.tokenRequests[0]).toMatchObject({
          grant_type: 'authorization_code',
          client_id: 'noumena-code-test',
          code: 'auth-code-1',
        })
        expect(server.tokenRequests[0]?.redirect_uri).toMatch(
          /^http:\/\/localhost:\d+\/callback$/,
        )
      } finally {
        oauthService.cleanup()
      }
    })
  })

  it('completes the callback-relay flow against a real mock issuer', async () => {
    const server = await createMockOauthServer()
    liveServers.push(server)

    await withMockOauthEnvironment(server, async () => {
      const oauthService = new OAuthService()
      try {
        const tokensPromise = oauthService.startOAuthFlow(
          async manualUrl => {
            expect(manualUrl).toContain('/oauth/authorize')
            const parsed = new URL(manualUrl)
            expect(parsed.searchParams.get('redirect_uri')).toContain('relay_id=')
            const completed = await server.completeRelayFlow(manualUrl)
            expect(completed.relayId).toBeTruthy()
            expect(completed.code).toBe('auth-code-1')
            expect(completed.state).toBeTruthy()
            expect(completed.callbackUrl).toContain(
              '/oauth/code/callback?app=noumena-code',
            )
          },
          {
            skipBrowserOpen: true,
          },
        )

        await expect(tokensPromise).resolves.toMatchObject({
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          subscriptionType: 'max',
          rateLimitTier: 'tier_1',
        })

        expect(server.relayCompletions).toHaveLength(1)
        expect(server.tokenRequests).toHaveLength(1)
        expect(server.tokenRequests[0]?.redirect_uri).toContain(
          '/oauth/code/callback?app=noumena-code&relay_id=',
        )
      } finally {
        oauthService.cleanup()
      }
    })
  })

  it('rejects the automatic localhost callback flow when the browser returns the wrong state', async () => {
    const server = await createMockOauthServer()
    liveServers.push(server)

    await withMockOauthEnvironment(server, async () => {
      const oauthService = new OAuthService()
      try {
        const tokensPromise = oauthService.startOAuthFlow(
          async (_manualUrl, automaticUrl) => {
            expect(automaticUrl).toBeDefined()
            const authorizeResponse = await fetch(automaticUrl!, {
              redirect: 'manual',
            })
            expect(authorizeResponse.status).toBe(302)

            const callbackUrl = authorizeResponse.headers.get('location')
            expect(callbackUrl).toBeTruthy()

            const badCallbackUrl = new URL(callbackUrl!)
            badCallbackUrl.searchParams.set('state', 'wrong-state')
            const callbackResponse = await fetch(badCallbackUrl, {
              redirect: 'manual',
            })

            expect(callbackResponse.status).toBe(400)
            expect(await callbackResponse.text()).toBe('Invalid state parameter')
          },
          {
            skipBrowserOpen: true,
          },
        )

        await expect(tokensPromise).rejects.toThrow('Invalid state parameter')
        expect(server.tokenRequests).toHaveLength(0)
      } finally {
        oauthService.cleanup()
      }
    })
  })

  it('redirects the browser to the error success page when token exchange fails after an automatic callback', async () => {
    const server = await createMockOauthServer()
    server.setAuthorizationCodeGrantError('invalid_grant')
    liveServers.push(server)

    await withMockOauthEnvironment(server, async () => {
      const expectedSuccessUrl = getOauthSuccessUrl(true)
      const oauthService = new OAuthService()
      try {
        const tokensPromise = oauthService.startOAuthFlow(
          async (_manualUrl, automaticUrl) => {
            expect(automaticUrl).toBeDefined()
            const completed = await server.completeAutomaticFlow(automaticUrl!)
            expect(completed.code).toBe('auth-code-1')
            expect(completed.state).toBeTruthy()
            expect(completed.successLocation).toBe(expectedSuccessUrl)
          },
          {
            skipBrowserOpen: true,
          },
        )

        await expect(tokensPromise).rejects.toThrow()
        expect(server.tokenRequests).toHaveLength(1)
        expect(server.tokenRequests[0]).toMatchObject({
          grant_type: 'authorization_code',
          code: 'auth-code-1',
        })
      } finally {
        oauthService.cleanup()
      }
    })
  })
})
