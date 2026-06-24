import axios from 'axios'
import { writeFile } from 'fs/promises'
import { getAuthRuntime } from '../auth/runtime/AuthRuntime.js'
import { getOauthConfig } from '../constants/oauth.js'
import type { LogOption } from '../types/logs.js'
import { logForDebugging } from './debug.js'
import { errorMessage } from './errors.js'
import { getAuthHeaders, getUserAgent, withOAuth401Retry } from './http.js'
import { buildNoumenaPlatformUrl } from './platformUrls.js'
import { loadTranscriptFromFile } from './sessionStorage.js'
import { jsonParse, jsonStringify } from './slowOperations.js'
import { generateTempFilePath } from './tempfile.js'

const CCSHARE_ID_RE = /^[A-Za-z0-9._-]+-\d{8}-\d{6}$/

type RecordLike = Record<string, unknown>

type MaterializedTranscript = {
  content: string
  extension: '.json' | '.jsonl'
}

export function parseCcshareId(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) {
    return null
  }

  const directMatch = trimmed.match(CCSHARE_ID_RE)
  if (directMatch) {
    return directMatch[0]!
  }

  try {
    const url = new URL(trimmed)
    if (
      (url.hostname === 'go' ||
        url.hostname.startsWith('go.') ||
        url.hostname.endsWith('.anthropic.com') ||
        url.hostname === 'claude.ai' ||
        url.hostname.endsWith('.claude.ai')) &&
      url.pathname.startsWith('/ccshare/')
    ) {
      const candidate = decodeURIComponent(
        url.pathname.slice('/ccshare/'.length).split('/')[0] ?? '',
      )
      if (CCSHARE_ID_RE.test(candidate)) {
        return candidate
      }
    }
  } catch {
    // Fall through to shortlink-without-scheme parsing.
  }

  const shortlinkMatch = trimmed.match(
    /^(?:go(?:\.[^/\s]+)?|claude\.ai)\/ccshare\/([^/?#]+)\/?(?:[?#].*)?$/i,
  )
  if (shortlinkMatch?.[1] && CCSHARE_ID_RE.test(shortlinkMatch[1])) {
    return shortlinkMatch[1]
  }

  return null
}

export async function loadCcshare(ccshareId: string): Promise<LogOption> {
  if (!CCSHARE_ID_RE.test(ccshareId)) {
    throw new Error(`Invalid ccshare ID: ${ccshareId}`)
  }

  const payload = await fetchCcsharePayload(ccshareId)
  const transcript = materializeTranscriptPayload(payload)
  const path = generateTempFilePath('claude-ccshare', transcript.extension, {
    contentHash: ccshareId,
  })

  await writeFile(path, transcript.content, 'utf8')
  return loadTranscriptFromFile(path)
}

async function fetchCcsharePayload(ccshareId: string): Promise<unknown> {
  await getAuthRuntime().resolveSession({ allowRefresh: true })

  const urls = buildCcshareCandidateUrls(ccshareId)
  const failures: string[] = []

  for (const url of urls) {
    try {
      const response = await withOAuth401Retry(() => {
        const authResult = getAuthHeaders()
        if (authResult.error) {
          throw new Error(`Failed to get auth headers: ${authResult.error}`)
        }
        return axios.get<string>(url, {
          headers: {
            ...authResult.headers,
            Accept: 'application/json, text/plain;q=0.9, */*;q=0.1',
            'User-Agent': getUserAgent(),
          },
          timeout: 15000,
          responseType: 'text',
          transformResponse: value => value,
        })
      }, {
        also403Revoked: true,
      })

      logForDebugging(`ccshare fetch succeeded: ${url}`, { level: 'info' })
      return parseTransportPayload(response.data)
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : null
      const detail =
        status !== undefined && status !== null
          ? `${url} -> HTTP ${status}`
          : `${url} -> ${errorMessage(error)}`
      failures.push(detail)
      logForDebugging(`ccshare fetch failed: ${detail}`, { level: 'warn' })
    }
  }

  throw new Error(
    `Unable to fetch shared transcript. Tried ${urls.length} endpoint${urls.length === 1 ? '' : 's'}: ${failures.join('; ')}`,
  )
}

export function buildCcshareCandidateUrls(ccshareId: string): string[] {
  const encoded = encodeURIComponent(ccshareId)
  const { CLAUDE_AI_ORIGIN } = getOauthConfig()
  return [
    buildNoumenaPlatformUrl(
      `/api/claude_code_shared_session_transcripts/${encoded}`,
    ),
    buildNoumenaPlatformUrl(
      `/api/claude_code_shared_session_transcripts/${encoded}/content`,
    ),
    `${CLAUDE_AI_ORIGIN}/api/claude_code_shared_session_transcripts/${encoded}`,
    `${CLAUDE_AI_ORIGIN}/api/claude_code_shared_session_transcripts/${encoded}/content`,
  ].filter((url, index, urls) => urls.indexOf(url) === index)
}

function parseTransportPayload(raw: unknown): unknown {
  if (typeof raw !== 'string') {
    return raw
  }

  const trimmed = raw.trim()
  if (!trimmed) {
    return raw
  }

  if (looksLikeJsonlTranscript(trimmed)) {
    return trimmed
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return jsonParse(trimmed)
    } catch {
      return raw
    }
  }

  return raw
}

function materializeTranscriptPayload(
  payload: unknown,
  depth: number = 0,
): MaterializedTranscript {
  if (depth > 4) {
    throw new Error('ccshare payload nesting exceeded supported depth')
  }

  if (typeof payload === 'string') {
    const trimmed = payload.trim()
    if (looksLikeJsonlTranscript(trimmed)) {
      return {
        content: trimmed.endsWith('\n') ? trimmed : `${trimmed}\n`,
        extension: '.jsonl',
      }
    }

    const parsed = parseTransportPayload(trimmed)
    if (parsed !== payload) {
      return materializeTranscriptPayload(parsed, depth + 1)
    }

    throw new Error(
      'Shared transcript payload was plain text, not resumable transcript data',
    )
  }

  if (Array.isArray(payload)) {
    if (isSerializedTranscriptMessageArray(payload)) {
      return {
        content: jsonStringify(payload, null, 2),
        extension: '.json',
      }
    }

    if (isApiMessageArray(payload)) {
      throw new Error(
        'Shared transcript only contains API-normalized messages, not a resumable raw transcript',
      )
    }
  }

  if (!isRecord(payload)) {
    throw new Error('Unsupported shared transcript payload format')
  }

  if (typeof payload.content === 'string' && payload.content.trim()) {
    return materializeTranscriptPayload(payload.content, depth + 1)
  }

  if (typeof payload.rawTranscriptJsonl === 'string' && payload.rawTranscriptJsonl.trim()) {
    return {
      content: ensureTrailingNewline(payload.rawTranscriptJsonl),
      extension: '.jsonl',
    }
  }

  if (
    typeof payload.raw_transcript_jsonl === 'string' &&
    payload.raw_transcript_jsonl.trim()
  ) {
    return {
      content: ensureTrailingNewline(payload.raw_transcript_jsonl),
      extension: '.jsonl',
    }
  }

  if (isSerializedTranscriptMessageArray(payload.messages)) {
    return {
      content: jsonStringify({ messages: payload.messages }, null, 2),
      extension: '.json',
    }
  }

  if (isSerializedTranscriptMessageArray(payload.transcript)) {
    return {
      content: jsonStringify({ messages: payload.transcript }, null, 2),
      extension: '.json',
    }
  }

  if (payload.data !== undefined) {
    return materializeTranscriptPayload(payload.data, depth + 1)
  }

  if (payload.result !== undefined) {
    return materializeTranscriptPayload(payload.result, depth + 1)
  }

  if (payload.transcript !== undefined && isApiMessageArray(payload.transcript)) {
    throw new Error(
      'Shared transcript is missing raw JSONL; the remaining transcript is API-normalized and cannot be resumed faithfully',
    )
  }

  if (payload.messages !== undefined && isApiMessageArray(payload.messages)) {
    throw new Error(
      'Shared transcript is missing raw JSONL; the remaining messages are API-normalized and cannot be resumed faithfully',
    )
  }

  throw new Error('Shared transcript payload did not contain resumable data')
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith('\n') ? value : `${value}\n`
}

function looksLikeJsonlTranscript(value: string): boolean {
  const firstLine = value
    .split('\n')
    .map(line => line.trim())
    .find(line => line.length > 0)

  if (!firstLine) {
    return false
  }

  try {
    const parsed = jsonParse(firstLine)
    return isSerializedTranscriptMessageLike(parsed)
  } catch {
    return false
  }
}

function isRecord(value: unknown): value is RecordLike {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isSerializedTranscriptMessageArray(
  value: unknown,
): value is RecordLike[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(item => isSerializedTranscriptMessageLike(item))
  )
}

function isSerializedTranscriptMessageLike(value: unknown): value is RecordLike {
  return (
    isRecord(value) &&
    typeof value.type === 'string' &&
    typeof value.timestamp === 'string' &&
    'message' in value &&
    (typeof value.sessionId === 'string' ||
      typeof value.uuid === 'string' ||
      typeof value.parentUuid === 'string')
  )
}

function isApiMessageArray(value: unknown): value is RecordLike[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(item => isApiMessageLike(item))
  )
}

function isApiMessageLike(value: unknown): value is RecordLike {
  return (
    isRecord(value) &&
    (value.role === 'user' || value.role === 'assistant') &&
    'content' in value
  )
}
