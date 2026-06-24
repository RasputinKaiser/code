import { getNoumenaPlatformBaseUrl } from 'src/utils/platformUrls.js'
import { getFirstPartyRequestHeaders, getWrappedClientFetch } from './client.js'

export type FirstPartyWebSearchHit = {
  title: string
  url: string
  snippet?: string
}

export type FirstPartyWebSearchResult = {
  tool_use_id: string
  content: FirstPartyWebSearchHit[]
}

export type FirstPartyWebSearchInput = {
  query: string
  allowed_domains?: string[]
  blocked_domains?: string[]
}

async function parseErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text()
    return text.trim()
  } catch {
    return ''
  }
}

export function getNoumenaWebSearchBaseUrl(): string {
  return (
    process.env.NOUMENA_WEB_SEARCH_BASE_URL?.trim() ||
    getNoumenaPlatformBaseUrl()
  )
}

export async function performFirstPartyWebSearch(
  input: FirstPartyWebSearchInput,
  options: {
    signal?: AbortSignal
    fetch?: typeof fetch
  } = {},
): Promise<FirstPartyWebSearchResult> {
  const baseURL = getNoumenaWebSearchBaseUrl()
  if (!baseURL) {
    throw new Error('Noumena web search requires a platform API base URL.')
  }

  const headers = await getFirstPartyRequestHeaders({
    includeApiKeyHeader: true,
  })
  const fetchImpl =
    options.fetch ?? getWrappedClientFetch(undefined, 'web_search_tool') ?? fetch
  const response = await fetchImpl(new URL('/v1/web_search', baseURL).toString(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(input),
    signal: options.signal,
  })

  if (!response.ok) {
    const body = await parseErrorBody(response)
    throw new Error(
      `Noumena web search failed with ${response.status}${body ? `: ${body}` : ''}`,
    )
  }

  return (await response.json()) as FirstPartyWebSearchResult
}
