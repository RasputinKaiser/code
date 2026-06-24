import type { AssistantMessage, Message } from '../../types/message.js'
import type { WebFetchSourceMetadata } from './WebFetchTool.js'

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }

const WEB_FETCH_SOURCE_RE =
  /<web_fetch_source>\s*([\s\S]*?)\s*<\/web_fetch_source>/g

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asWebFetchSourceMetadata(
  value: unknown,
): WebFetchSourceMetadata | null {
  if (!isRecord(value)) {
    return null
  }
  if (
    typeof value.source_id !== 'string' ||
    value.executor !== 'client_local_fetch' ||
    typeof value.requested_url !== 'string' ||
    typeof value.final_url !== 'string' ||
    typeof value.http_status !== 'number' ||
    typeof value.http_status_text !== 'string' ||
    typeof value.bytes_fetched !== 'number' ||
    !Array.isArray(value.redirect_chain) ||
    !value.redirect_chain.every(item => typeof item === 'string')
  ) {
    return null
  }

  const metadata: WebFetchSourceMetadata = {
    source_id: value.source_id,
    executor: 'client_local_fetch',
    requested_url: value.requested_url,
    final_url: value.final_url,
    http_status: value.http_status,
    http_status_text: value.http_status_text,
    bytes_fetched: value.bytes_fetched,
    redirect_chain: value.redirect_chain,
  }
  if (typeof value.redirect_url === 'string') {
    metadata.redirect_url = value.redirect_url
  }
  return metadata
}

export function extractWebFetchSourcesFromText(
  text: string,
): WebFetchSourceMetadata[] {
  const sources: WebFetchSourceMetadata[] = []
  for (const match of text.matchAll(WEB_FETCH_SOURCE_RE)) {
    const rawJson = match[1]
    if (!rawJson) {
      continue
    }
    try {
      const source = asWebFetchSourceMetadata(JSON.parse(rawJson))
      if (source) {
        sources.push(source)
      }
    } catch {
      // Ignore malformed tool-result metadata. It is model input, not a trust boundary.
    }
  }
  return sources
}

export function collectWebFetchSourcesFromMessages(
  messages: readonly Message[],
): WebFetchSourceMetadata[] {
  const sourcesById = new Map<string, WebFetchSourceMetadata>()
  for (const message of messages) {
    if (message.type !== 'user' || !Array.isArray(message.message.content)) {
      continue
    }
    for (const block of message.message.content) {
      if (
        !isRecord(block) ||
        block.type !== 'tool_result' ||
        typeof block.content !== 'string'
      ) {
        continue
      }
      for (const source of extractWebFetchSourcesFromText(block.content)) {
        sourcesById.set(source.source_id, source)
      }
    }
  }
  return [...sourcesById.values()]
}

function extractJsonPayload(text: string):
  | {
      jsonText: string
      wrap: (jsonText: string) => string
      pretty: boolean
    }
  | null {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/)
  if (fenced?.[1]) {
    return {
      jsonText: fenced[1],
      wrap: jsonText => `\`\`\`json\n${jsonText}\n\`\`\``,
      pretty: true,
    }
  }
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    return {
      jsonText: trimmed,
      wrap: jsonText => jsonText,
      pretty: trimmed.includes('\n'),
    }
  }
  return null
}

function sourceMap(
  sources: readonly WebFetchSourceMetadata[],
): Map<string, WebFetchSourceMetadata> {
  return new Map(sources.map(source => [source.source_id, source]))
}

function repairJsonValue(
  value: JsonValue,
  sourcesById: Map<string, WebFetchSourceMetadata>,
): { value: JsonValue; changed: boolean } {
  if (Array.isArray(value)) {
    let changed = false
    const next = value.map(item => {
      const repaired = repairJsonValue(item, sourcesById)
      changed ||= repaired.changed
      return repaired.value
    })
    return { value: next, changed }
  }

  if (!isRecord(value)) {
    return { value, changed: false }
  }

  let changed = false
  const next: Record<string, JsonValue> = {}
  for (const [key, rawChild] of Object.entries(value)) {
    const child = rawChild as JsonValue
    const repaired = repairJsonValue(child, sourcesById)
    changed ||= repaired.changed
    next[key] = repaired.value
  }

  const sourceId = typeof next.source_id === 'string' ? next.source_id : null
  const source = sourceId ? sourcesById.get(sourceId) : undefined
  if (!source) {
    return { value: next, changed }
  }

  const authoritativeFields: Array<[string, JsonValue]> = [
    ['final_url', source.final_url],
    ['fetched_url', source.final_url],
    ['url', source.final_url],
    ['requested_url', source.requested_url],
    ['http_status', source.http_status],
    ['http_status_text', source.http_status_text],
    ['bytes_fetched', source.bytes_fetched],
    ['redirect_chain', source.redirect_chain],
  ]
  if (source.redirect_url !== undefined) {
    authoritativeFields.push(['redirect_url', source.redirect_url])
  }

  for (const [field, authoritativeValue] of authoritativeFields) {
    if (Object.prototype.hasOwnProperty.call(next, field)) {
      const previous = JSON.stringify(next[field])
      const replacement = JSON.stringify(authoritativeValue)
      if (previous !== replacement) {
        next[field] = authoritativeValue
        changed = true
      }
    }
  }

  return { value: next, changed }
}

function appendSourceReferences(
  text: string,
  sources: readonly WebFetchSourceMetadata[],
): string {
  const referenced = sources.filter(source => text.includes(source.source_id))
  if (referenced.length === 0) {
    return text
  }
  const missing = referenced.filter(source => !text.includes(source.final_url))
  if (missing.length === 0) {
    return text
  }
  const lines = missing.map(source => `- ${source.source_id}: ${source.final_url}`)
  return `${text.trimEnd()}\n\nSources:\n${lines.join('\n')}`
}

export function repairWebFetchProvenanceInText(
  text: string,
  sources: readonly WebFetchSourceMetadata[],
): string {
  if (sources.length === 0 || text.trim() === '') {
    return text
  }

  const payload = extractJsonPayload(text)
  if (payload) {
    try {
      const parsed = JSON.parse(payload.jsonText) as JsonValue
      const repaired = repairJsonValue(parsed, sourceMap(sources))
      if (!repaired.changed) {
        return text
      }
      return payload.wrap(
        JSON.stringify(repaired.value, null, payload.pretty ? 2 : 0),
      )
    } catch {
      // Fall through to plain-text source rendering.
    }
  }

  return appendSourceReferences(text, sources)
}

export function repairAssistantMessageWebFetchProvenance(
  message: AssistantMessage,
  priorMessages: readonly Message[],
): AssistantMessage {
  const sources = collectWebFetchSourcesFromMessages(priorMessages)
  if (sources.length === 0) {
    return message
  }

  let changed = false
  const content = message.message.content.map(block => {
    if (block.type !== 'text') {
      return block
    }
    const repairedText = repairWebFetchProvenanceInText(block.text, sources)
    if (repairedText === block.text) {
      return block
    }
    changed = true
    return { ...block, text: repairedText }
  })

  if (!changed) {
    return message
  }
  return {
    ...message,
    message: {
      ...message.message,
      content,
    },
  }
}
