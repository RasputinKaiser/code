import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import axios from 'axios'
import type { AxiosResponse } from 'axios'
import {
  checkDomainBlocklist,
  clearWebFetchCache,
  getURLMarkdownContent,
  getWithPermittedRedirects,
  isPermittedRedirect,
  validateURL,
} from './utils.js'

;(globalThis as unknown as { MACRO: { VERSION: string } }).MACRO = {
  VERSION: 'test',
}

const originalAxiosGet = axios.get

function arrayBufferFromText(text: string): ArrayBuffer {
  const buffer = Buffer.from(text, 'utf8')
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  )
}

function makeAxiosResponse(
  url: string,
  body: string,
  contentType = 'text/plain',
): AxiosResponse<ArrayBuffer> {
  return {
    config: {},
    data: arrayBufferFromText(body),
    headers: { 'content-type': contentType },
    status: 200,
    statusText: 'OK',
    request: { url },
  } as AxiosResponse<ArrayBuffer>
}

function makeRedirectError(status: number, location: string): Error {
  return {
    isAxiosError: true,
    name: 'AxiosError',
    message: `Redirect ${status}`,
    response: {
      status,
      headers: { location },
    },
  } as unknown as Error
}

describe('WebFetch URL validation', () => {
  it('accepts only public-looking http and https URLs without credentials', () => {
    expect(validateURL('https://example.com/page')).toBe(true)
    expect(validateURL('http://example.com/page')).toBe(true)
    expect(validateURL('ftp://example.com/file')).toBe(false)
    expect(validateURL('file:///etc/passwd')).toBe(false)
    expect(validateURL('https://user:pass@example.com/page')).toBe(false)
    expect(validateURL('https://localhost/page')).toBe(false)
    expect(validateURL('not a url')).toBe(false)
  })
})

describe('WebFetch redirect policy', () => {
  it('permits same-site redirects and www host normalization only', () => {
    expect(
      isPermittedRedirect(
        'https://example.com/a',
        'https://www.example.com/b',
      ),
    ).toBe(true)
    expect(
      isPermittedRedirect(
        'https://www.example.com/a',
        'https://example.com/b',
      ),
    ).toBe(true)
    expect(
      isPermittedRedirect(
        'https://example.com/a',
        'https://example.com/b?x=1',
      ),
    ).toBe(true)
    expect(
      isPermittedRedirect('https://example.com/a', 'http://example.com/b'),
    ).toBe(false)
    expect(
      isPermittedRedirect('https://example.com/a', 'https://evil.com/b'),
    ).toBe(false)
    expect(
      isPermittedRedirect(
        'https://example.com/a',
        'https://user:pass@example.com/b',
      ),
    ).toBe(false)
  })
})

describe('WebFetch HTTP transport contract', () => {
  beforeEach(() => {
    clearWebFetchCache()
  })

  afterEach(() => {
    axios.get = originalAxiosGet
    clearWebFetchCache()
  })

  it('tracks final URL and redirect chain for permitted redirects', async () => {
    const calls: string[] = []
    axios.get = (async (url: string) => {
      calls.push(url)
      if (url === 'https://example.com/start') {
        throw makeRedirectError(302, '/next')
      }
      return makeAxiosResponse(url, 'ok')
    }) as typeof axios.get

    const response = await getWithPermittedRedirects(
      'https://example.com/start',
      new AbortController().signal,
      isPermittedRedirect,
    )

    expect('type' in response).toBe(false)
    if ('type' in response) {
      throw new Error('Expected fetched response')
    }
    expect(calls).toEqual([
      'https://example.com/start',
      'https://example.com/next',
    ])
    expect(response.finalUrl).toBe('https://example.com/next')
    expect(response.redirectChain).toEqual(['https://example.com/next'])
  })

  it('stops and reports cross-site redirects instead of following them', async () => {
    axios.get = (async () => {
      throw makeRedirectError(302, 'https://evil.example/next')
    }) as typeof axios.get

    const response = await getWithPermittedRedirects(
      'https://example.com/start',
      new AbortController().signal,
      isPermittedRedirect,
    )

    expect(response).toEqual({
      type: 'redirect',
      originalUrl: 'https://example.com/start',
      redirectUrl: 'https://evil.example/next',
      statusCode: 302,
      redirectChain: ['https://evil.example/next'],
    })
  })

  it('upgrades http to https and preserves final URL metadata', async () => {
    const calls: string[] = []
    axios.get = (async (url: string) => {
      calls.push(url)
      if (url.includes('/api/web/domain_info?')) {
        return {
          data: { can_fetch: true },
          status: 200,
          statusText: 'OK',
        }
      }
      return makeAxiosResponse(url, 'plain text')
    }) as typeof axios.get

    const response = await getURLMarkdownContent(
      'http://example.com/page',
      new AbortController(),
    )

    expect('type' in response).toBe(false)
    if ('type' in response) {
      throw new Error('Expected fetched content')
    }
    expect(calls.some(url => url.includes('/api/web/domain_info?'))).toBe(true)
    expect(calls).toContain('https://example.com/page')
    expect(response.content).toBe('plain text')
    expect(response.finalUrl).toBe('https://example.com/page')
    expect(response.redirectChain).toEqual([])
  })

  it('caches fetched content with final URL metadata', async () => {
    const fetchCalls: string[] = []
    axios.get = (async (url: string) => {
      if (url.includes('/api/web/domain_info?')) {
        return {
          data: { can_fetch: true },
          status: 200,
          statusText: 'OK',
        }
      }
      fetchCalls.push(url)
      return makeAxiosResponse(url, 'cached text')
    }) as typeof axios.get

    const first = await getURLMarkdownContent(
      'https://example.com/cache',
      new AbortController(),
    )
    const second = await getURLMarkdownContent(
      'https://example.com/cache',
      new AbortController(),
    )

    expect('type' in first).toBe(false)
    expect('type' in second).toBe(false)
    if ('type' in first || 'type' in second) {
      throw new Error('Expected fetched content')
    }
    expect(fetchCalls).toEqual(['https://example.com/cache'])
    expect(second.finalUrl).toBe('https://example.com/cache')
    expect(second.redirectChain).toEqual([])
  })

  it('caches successful domain preflight decisions by hostname', async () => {
    const calls: string[] = []
    axios.get = (async (url: string) => {
      calls.push(url)
      return {
        data: { can_fetch: true },
        status: 200,
        statusText: 'OK',
      }
    }) as typeof axios.get

    expect(await checkDomainBlocklist('example.com')).toEqual({
      status: 'allowed',
    })
    expect(await checkDomainBlocklist('example.com')).toEqual({
      status: 'allowed',
    })
    expect(calls).toHaveLength(1)
  })
})
