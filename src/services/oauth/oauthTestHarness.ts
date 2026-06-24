import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import type { AddressInfo } from 'net'
import { tmpdir } from 'os'
import { join } from 'path'
import type { SessionResource } from '../../utils/teleport/api.js'

type RelayRecord = {
  readonly state: string
  authorizationCode: string | null
}

export type MockOauthRequest = {
  readonly method: string
  readonly path: string
  readonly search: string
  readonly headers: Record<string, string | undefined>
  readonly body: string
}

export type MockOauthServer = {
  readonly issuerBaseUrl: string
  readonly webBaseUrl: string
  readonly platformBaseUrl: string
  readonly requests: MockOauthRequest[]
  readonly tokenRequests: Array<Record<string, string>>
  readonly refreshRequests: Array<Record<string, string>>
  readonly relayCompletions: Array<{
    readonly relayId: string
    readonly code: string
    readonly state: string
  }>
  setSessions(sessions: SessionResource[]): void
  setAuthorizationCodeGrantError(error: string | null): void
  setRefreshGrantError(error: string | null): void
  completeAutomaticFlow(authorizeUrl: string): Promise<{
    readonly code: string
    readonly state: string
    readonly callbackUrl: string
    readonly successLocation: string | null
  }>
  completeRelayFlow(authorizeUrl: string): Promise<{
    readonly relayId: string
    readonly code: string
    readonly state: string
    readonly callbackUrl: string
  }>
  close(): Promise<void>
}

export type MockOauthBrowserHarness = {
  readonly command: string
  readInvocations(): Promise<string[]>
  close(): Promise<void>
}

type MockOauthBrowserMode = 'follow' | 'record-only'

export type MockProtectedResourceServer = {
  readonly baseUrl: string
  readonly authorizationHeaders: string[]
  close(): Promise<void>
}

export type AuthCliOutputEvent =
  | {
      readonly type: 'opening_browser'
      readonly line: string
    }
  | {
      readonly type: 'manual_url'
      readonly line: string
      readonly url: string
    }
  | {
      readonly type: 'login_success'
      readonly line: string
    }
  | {
      readonly type: 'reauth_start'
      readonly line: string
    }
  | {
      readonly type: 'reauth_success'
      readonly line: string
    }

export async function createMockOauthServer(): Promise<MockOauthServer> {
  const requests: MockOauthRequest[] = []
  const tokenRequests: Array<Record<string, string>> = []
  const refreshRequests: Array<Record<string, string>> = []
  const relayCompletions: Array<{
    readonly relayId: string
    readonly code: string
    readonly state: string
  }> = []
  const relays = new Map<string, RelayRecord>()
  const issuedCodes = new Map<string, string>()
  const sessionsById = new Map<string, SessionResource>()
  let nextCodeId = 1
  let authorizationCodeGrantError: string | null = null
  let refreshGrantError: string | null = null

  const server = createServer(async (req, res) => {
    const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host}`)
    const body = await readBody(req)

    requests.push({
      method: req.method ?? 'GET',
      path: requestUrl.pathname,
      search: requestUrl.search,
      headers: normalizeHeaders(req.headers),
      body,
    })

    if (req.method === 'GET' && requestUrl.pathname === '/oauth/authorize') {
      const redirectUri = requestUrl.searchParams.get('redirect_uri')
      const state = requestUrl.searchParams.get('state')
      if (!redirectUri || !state) {
        respondJson(res, 400, { error: 'missing redirect_uri or state' })
        return
      }

      const code = `auth-code-${nextCodeId++}`
      issuedCodes.set(code, state)
      const redirectUrl = new URL(redirectUri)
      redirectUrl.searchParams.set('code', code)
      redirectUrl.searchParams.set('state', state)

      res.writeHead(302, { Location: redirectUrl.toString() })
      res.end()
      return
    }

    if (
      req.method === 'POST' &&
      requestUrl.pathname === '/oauth/callback-relay/register'
    ) {
      const form = parseJsonObject(body)
      const relayId = form.relay_id
      const state = form.state
      if (!relayId || !state) {
        respondJson(res, 400, { error: 'missing relay_id or state' })
        return
      }
      relays.set(relayId, {
        state,
        authorizationCode: null,
      })
      respondJson(res, 200, { ok: true })
      return
    }

    if (
      req.method === 'POST' &&
      requestUrl.pathname === '/oauth/callback-relay/poll'
    ) {
      const form = parseJsonObject(body)
      const relayId = form.relay_id
      if (!relayId) {
        respondJson(res, 400, { error: 'missing relay_id' })
        return
      }
      const relay = relays.get(relayId)
      if (!relay || !relay.authorizationCode) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'pending' }))
        return
      }
      relays.delete(relayId)
      respondJson(res, 200, {
        authorization_code: relay.authorizationCode,
      })
      return
    }

    if (
      req.method === 'POST' &&
      requestUrl.pathname === '/oauth/callback-relay/complete'
    ) {
      const form = parseFormBody(body)
      const relayId = form.relay_id
      const code = form.code
      const state = form.state
      if (!relayId || !code || !state) {
        res.writeHead(400)
        res.end('missing relay_id, code, or state')
        return
      }
      const relay = relays.get(relayId)
      if (!relay || relay.state !== state) {
        res.writeHead(400)
        res.end('invalid relay state')
        return
      }
      relay.authorizationCode = code
      relayCompletions.push({ relayId, code, state })
      res.writeHead(204)
      res.end()
      return
    }

    if (req.method === 'POST' && requestUrl.pathname === '/oauth/token') {
      const form = parseTokenBody(body)
      tokenRequests.push(form)
      if (form.grant_type === 'refresh_token') {
        refreshRequests.push(form)
        if (refreshGrantError) {
          respondJson(res, 400, { error: refreshGrantError })
          return
        }
        respondJson(res, 200, {
          access_token: 'refreshed-access-token',
          refresh_token: 'refreshed-refresh-token',
          expires_in: 3600,
          scope:
            'org:create_api_key user:profile user:inference user:sessions:ncode user:mcp_servers user:file_upload',
          account: {
            uuid: 'acct-test',
            email_address: 'dev@noumena.test',
          },
          organization: {
            uuid: 'org-test',
          },
        })
        return
      }
      if (form.grant_type !== 'authorization_code') {
        respondJson(res, 400, { error: 'unsupported_grant_type' })
        return
      }
      if (authorizationCodeGrantError) {
        respondJson(res, 400, { error: authorizationCodeGrantError })
        return
      }
      const code = form.code
      const state = form.state
      if (!code || !state || issuedCodes.get(code) !== state) {
        respondJson(res, 400, { error: 'invalid_grant' })
        return
      }
      respondJson(res, 200, {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
        scope: 'org:create_api_key user:profile user:inference user:sessions:ncode user:mcp_servers user:file_upload',
        account: {
          uuid: 'acct-test',
          email_address: 'dev@noumena.test',
        },
        organization: {
          uuid: 'org-test',
        },
      })
      return
    }

    if (req.method === 'GET' && requestUrl.pathname === '/oauth/code/success') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end('<html><body>success</body></html>')
      return
    }

    if (req.method === 'GET' && requestUrl.pathname === '/api/oauth/profile') {
      respondJson(res, 200, {
        account: {
          uuid: 'acct-test',
          email: 'dev@noumena.test',
          display_name: 'Dev User',
          created_at: '2026-04-01T00:00:00Z',
        },
        organization: {
          uuid: 'org-test',
          organization_type: 'claude_max',
          rate_limit_tier: 'tier_1',
          has_extra_usage_enabled: true,
          billing_type: null,
          subscription_created_at: '2026-04-02T00:00:00Z',
        },
      })
      return
    }

    if (req.method === 'GET' && requestUrl.pathname === '/v1/sessions') {
      const authorization = req.headers.authorization
      if (
        authorization !== 'Bearer access-token' &&
        authorization !== 'Bearer refreshed-access-token'
      ) {
        respondJson(res, 401, {
          error: {
            message: 'unauthorized',
          },
        })
        return
      }
      const sessions = [...sessionsById.values()]
      respondJson(res, 200, {
        data: sessions,
        has_more: false,
        first_id: sessions[0]?.id ?? null,
        last_id: sessions.at(-1)?.id ?? null,
      })
      return
    }

    if (
      req.method === 'GET' &&
      requestUrl.pathname.startsWith('/v1/sessions/')
    ) {
      const authorization = req.headers.authorization
      if (
        authorization !== 'Bearer access-token' &&
        authorization !== 'Bearer refreshed-access-token'
      ) {
        respondJson(res, 401, {
          error: {
            message: 'unauthorized',
          },
        })
        return
      }
      const sessionId = requestUrl.pathname.slice('/v1/sessions/'.length)
      const session = sessionsById.get(sessionId)
      if (!session) {
        respondJson(res, 404, {
          error: {
            message: `Session not found: ${sessionId}`,
          },
        })
        return
      }
      respondJson(res, 200, session)
      return
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'not_found' }))
  })

  await new Promise<void>((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve())
    server.once('error', reject)
  })

  const address = server.address() as AddressInfo
  const baseUrl = `http://127.0.0.1:${address.port}`

  return {
    issuerBaseUrl: baseUrl,
    webBaseUrl: baseUrl,
    platformBaseUrl: baseUrl,
    requests,
    tokenRequests,
    refreshRequests,
    relayCompletions,
    setSessions(sessions) {
      sessionsById.clear()
      for (const session of sessions) {
        sessionsById.set(session.id, session)
      }
    },
    setAuthorizationCodeGrantError(error) {
      authorizationCodeGrantError = error
    },
    setRefreshGrantError(error) {
      refreshGrantError = error
    },
    async completeAutomaticFlow(authorizeUrl) {
      const authorizeResponse = await fetch(authorizeUrl, { redirect: 'manual' })
      const callbackUrl = requireRedirectLocation(authorizeResponse, authorizeUrl)
      const callbackResponse = await fetch(callbackUrl, { redirect: 'manual' })
      const successLocation = callbackResponse.headers.get('location')
      return {
        code: new URL(callbackUrl).searchParams.get('code') ?? '',
        state: new URL(callbackUrl).searchParams.get('state') ?? '',
        callbackUrl,
        successLocation,
      }
    },
    async completeRelayFlow(authorizeUrl) {
      const authorizeResponse = await fetch(authorizeUrl, { redirect: 'manual' })
      const callbackUrl = requireRedirectLocation(authorizeResponse, authorizeUrl)
      const parsed = new URL(callbackUrl)
      const relayId = parsed.searchParams.get('relay_id') ?? ''
      const code = parsed.searchParams.get('code') ?? ''
      const state = parsed.searchParams.get('state') ?? ''

      const completeResponse = await fetch(`${baseUrl}/oauth/callback-relay/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          relay_id: relayId,
          code,
          state,
        }),
      })

      if (completeResponse.status !== 204) {
        throw new Error(
          `relay completion failed: ${completeResponse.status} ${await completeResponse.text()}`,
        )
      }

      return {
        relayId,
        code,
        state,
        callbackUrl,
      }
    },
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      })
    },
  }
}

const OAUTH_ENV_KEYS = [
  'NOUMENA_ISSUER_BASE_URL',
  'NOUMENA_OAUTH_WEB_BASE_URL',
  'NOUMENA_PLATFORM_BASE_URL',
  'NOUMENA_OAUTH_CLIENT_ID',
  'BROWSER',
  'NCODE_CONFIG_DIR',
  'CLAUDE_CONFIG_DIR',
] as const

export async function withMockOauthEnvironment<T>(
  server: MockOauthServer,
  fn: () => Promise<T>,
): Promise<T> {
  const originalEnv = Object.fromEntries(
    OAUTH_ENV_KEYS.map(key => [key, process.env[key]]),
  ) as Record<(typeof OAUTH_ENV_KEYS)[number], string | undefined>

  process.env.NOUMENA_ISSUER_BASE_URL = server.issuerBaseUrl
  process.env.NOUMENA_OAUTH_WEB_BASE_URL = server.webBaseUrl
  process.env.NOUMENA_PLATFORM_BASE_URL = server.platformBaseUrl
  process.env.NOUMENA_OAUTH_CLIENT_ID = 'noumena-code-test'

  try {
    return await fn()
  } finally {
    for (const key of OAUTH_ENV_KEYS) {
      const value = originalEnv[key]
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

export async function createMockOauthBrowserHarness(options?: {
  readonly mode?: MockOauthBrowserMode
}): Promise<MockOauthBrowserHarness> {
  const harnessDir = await mkdtemp(join(tmpdir(), 'ncode-oauth-browser-'))
  const browserRunnerPath = join(harnessDir, 'browser-runner.mjs')
  const browserCommandPath = join(harnessDir, 'browser.sh')
  const invocationsPath = join(harnessDir, 'invocations.jsonl')
  const mode = options?.mode ?? 'follow'

  await writeFile(
    browserRunnerPath,
    `
import { appendFile } from 'fs/promises'

const url = process.argv[2]
if (!url) {
  process.exit(2)
}

await appendFile(${JSON.stringify(invocationsPath)}, JSON.stringify(url) + '\\n')
if (${JSON.stringify(mode)} === 'record-only') {
  process.exit(0)
}
const response = await fetch(url, { redirect: 'follow' })
if (!response.ok) {
  process.exit(1)
}
`,
    'utf8',
  )

  await writeFile(
    browserCommandPath,
    `#!/usr/bin/env bash
set -euo pipefail
exec ${shellQuote(process.execPath)} ${shellQuote(browserRunnerPath)} "$1"
`,
    'utf8',
  )
  await chmod(browserCommandPath, 0o755)

  return {
    command: browserCommandPath,
    async readInvocations() {
      try {
        const content = await readFile(invocationsPath, 'utf8')
        return content
          .split('\n')
          .filter(Boolean)
          .map(line => JSON.parse(line) as string)
      } catch {
        return []
      }
    },
    async close() {
      await rm(harnessDir, { recursive: true, force: true })
    },
  }
}

export async function waitForPrintedOauthUrl(
  readOutput: () => string,
  options?: {
    readonly prefix?: string
    readonly timeoutMs?: number
  },
): Promise<string> {
  const prefix = options?.prefix ?? "If the browser didn't open, visit: "
  const deadline = Date.now() + (options?.timeoutMs ?? 5000)

  for (;;) {
    const output = readOutput()
    const markerIndex = output.lastIndexOf(prefix)
    if (markerIndex !== -1) {
      const candidate = output
        .slice(markerIndex + prefix.length)
        .split(/\r?\n/, 1)[0]
        ?.trim()
      if (candidate?.startsWith('http://') || candidate?.startsWith('https://')) {
        return candidate
      }
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out waiting for printed OAuth URL with prefix ${JSON.stringify(prefix)}.\nCurrent output:\n${output}`,
      )
    }

    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

export function parseAuthCliOutputEvents(
  output: string,
): AuthCliOutputEvent[] {
  const events: AuthCliOutputEvent[] = []

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.length === 0) {
      continue
    }

    if (line === 'Opening browser to sign in…') {
      events.push({
        type: 'opening_browser',
        line,
      })
      continue
    }

    if (line === 'Managed session expired. Opening browser to re-authenticate…') {
      events.push({
        type: 'reauth_start',
        line,
      })
      continue
    }

    if (line.startsWith("If the browser didn't open, visit: ")) {
      const url = line.slice("If the browser didn't open, visit: ".length).trim()
      if (url.startsWith('http://') || url.startsWith('https://')) {
        events.push({
          type: 'manual_url',
          line,
          url,
        })
      }
      continue
    }

    if (line === 'Login successful.') {
      events.push({
        type: 'login_success',
        line,
      })
      continue
    }

    if (line === 'Re-authentication successful. Retrying…') {
      events.push({
        type: 'reauth_success',
        line,
      })
      continue
    }
  }

  return events
}

export async function createMockProtectedResourceServer(options?: {
  readonly successBearerToken?: string
  readonly revokedAs403?: boolean
}): Promise<MockProtectedResourceServer> {
  const authorizationHeaders: string[] = []
  const successBearerToken = options?.successBearerToken ?? 'Bearer access-token'

  const server = createServer(async (req, res) => {
    const authorization = req.headers.authorization
    authorizationHeaders.push(authorization ?? '')

    if (authorization === successBearerToken) {
      respondJson(res, 200, { ok: true })
      return
    }

    if (options?.revokedAs403) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('OAuth token has been revoked')
      return
    }

    respondJson(res, 401, { error: 'unauthorized' })
  })

  await new Promise<void>((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve())
    server.once('error', reject)
  })

  const address = server.address() as AddressInfo
  const baseUrl = `http://127.0.0.1:${address.port}`

  return {
    baseUrl,
    authorizationHeaders,
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      })
    },
  }
}

function normalizeHeaders(
  headers: IncomingMessage['headers'],
): Record<string, string | undefined> {
  const normalized: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      normalized[key] = value.join(', ')
    } else {
      normalized[key] = value
    }
  }
  return normalized
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

function parseFormBody(body: string): Record<string, string> {
  const params = new URLSearchParams(body)
  return Object.fromEntries(params.entries())
}

function parseTokenBody(body: string): Record<string, string> {
  const trimmed = body.trim()
  if (trimmed.startsWith('{')) {
    return parseJsonObject(body)
  }
  return parseFormBody(body)
}

function parseJsonObject(body: string): Record<string, string> {
  return JSON.parse(body || '{}') as Record<string, string>
}

function respondJson(
  res: ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

function requireRedirectLocation(response: Response, requestUrl: string): string {
  const location = response.headers.get('location')
  if (response.status !== 302 || !location) {
    throw new Error(
      `authorize did not redirect as expected: ${response.status} from ${requestUrl}`,
    )
  }
  return new URL(location, requestUrl).toString()
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\"'\"'`)}'`
}
