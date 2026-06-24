import { OpenAICompatInferenceClient } from './openAICompatInferenceClient.js'

type JSONValue =
  | null
  | boolean
  | number
  | string
  | JSONValue[]
  | { [key: string]: JSONValue }

export type OpenAICompatReplayChunk = {
  id?: string
  object?: string
  created?: number
  model?: string
  system_fingerprint?: string
  choices?: Array<Record<string, JSONValue>>
  usage?: Record<string, JSONValue>
}

export type OpenAICompatReplayReceipt = {
  fixture_type: 'openai_compat_stream_receipt'
  source_receipt_path: string
  source_response_index: number
  response: {
    type: 'response'
    timestamp: string
    data: {
      stream: true
      chunks: OpenAICompatReplayChunk[]
    }
  }
}

export type OpenAICompatReplayDumpPromptsFile = {
  init: Record<string, JSONValue> | null
  message: Record<string, JSONValue> | null
  receipts: OpenAICompatReplayReceipt[]
}

export type OpenAICompatDumpPromptsRequestShapeSummary = {
  source_path: string
  model: string | null
  max_tokens: number | null
  max_completion_tokens: number | null
  stream: boolean | null
  stream_reasoning: boolean | null
  reasoning_effort: string | null
  tool_names: string[]
  tool_count: number
  requested_betas: string[]
  has_context_management: boolean
  context_management_edit_types: string[]
  message_role: string | null
  message_content_length: number
  includes_parent_repo_agents: boolean
  includes_ncode_agents: boolean
  includes_claude_md: boolean
  message_tail: string
}

export function parseOpenAICompatReplayReceipt(raw: string): OpenAICompatReplayReceipt {
  const parsed = JSON.parse(raw) as Partial<OpenAICompatReplayReceipt>
  if (parsed.fixture_type !== 'openai_compat_stream_receipt') {
    throw new Error('Malformed replay fixture missing fixture_type')
  }
  if (
    parsed.response?.type !== 'response' ||
    parsed.response?.data?.stream !== true ||
    !Array.isArray(parsed.response?.data?.chunks)
  ) {
    throw new Error('Malformed replay fixture missing streamed response chunks')
  }
  return parsed as OpenAICompatReplayReceipt
}

export function buildOpenAICompatReplaySseEvents(
  receipt: OpenAICompatReplayReceipt,
): string[] {
  return [
    ...receipt.response.data.chunks.map(
      (chunk) => `data: ${JSON.stringify(chunk)}\n\n`,
    ),
    'data: [DONE]\n\n',
  ]
}

export function createOpenAICompatReplayResponse(
  receipt: OpenAICompatReplayReceipt,
  requestId: string = `req-replay-${receipt.source_response_index}`,
): Response {
  const events = buildOpenAICompatReplaySseEvents(receipt)
  const stream = new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(new TextEncoder().encode(event))
      }
      controller.close()
    },
  })

  return new Response(stream, {
    headers: { 'request-id': requestId },
  })
}

export function extractOpenAICompatReplayReceiptsFromDumpPrompts(
  raw: string,
  sourceReceiptPath: string = '<inline>',
): OpenAICompatReplayDumpPromptsFile {
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  let init: Record<string, JSONValue> | null = null
  let message: Record<string, JSONValue> | null = null
  const receipts: OpenAICompatReplayReceipt[] = []

  for (const [lineIndex, line] of lines.entries()) {
    const record = JSON.parse(line) as {
      type?: string
      data?: Record<string, JSONValue>
    }
    if (record.type === 'init' && record.data && init === null) {
      init = record.data
      continue
    }
    if (record.type === 'message' && record.data && message === null) {
      message = record.data
      continue
    }
    if (
      record.type === 'response' &&
      record.data?.stream === true &&
      Array.isArray(record.data.chunks)
    ) {
      receipts.push({
        fixture_type: 'openai_compat_stream_receipt',
        source_receipt_path: sourceReceiptPath,
        source_response_index: receipts.length,
        response: {
          type: 'response',
          timestamp:
            typeof (record as { timestamp?: unknown }).timestamp === 'string'
              ? ((record as { timestamp: string }).timestamp as string)
              : `line-${lineIndex + 1}`,
          data: {
            stream: true,
            chunks: record.data.chunks as OpenAICompatReplayChunk[],
          },
        },
      })
    }
  }

  return { init, message, receipts }
}

function extractToolNames(initTools: JSONValue | undefined): string[] {
  if (!Array.isArray(initTools)) return []
  return initTools
    .map((entry) => {
      if (
        !entry ||
        typeof entry !== 'object' ||
        entry.type !== 'function' ||
        !entry.function ||
        typeof entry.function !== 'object'
      ) {
        return null
      }
      const fn = entry.function as { name?: unknown }
      return typeof fn.name === 'string' ? fn.name : null
    })
    .filter((name): name is string => name !== null)
}

function extractMessageText(
  message: Record<string, JSONValue> | null,
): { role: string | null; text: string } {
  const role = typeof message?.role === 'string' ? message.role : null
  const content = message?.content
  if (typeof content === 'string') {
    return { role, text: content }
  }
  if (Array.isArray(content)) {
    const text = content
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return ''
        const item = entry as { type?: unknown; text?: unknown }
        return item.type === 'text' && typeof item.text === 'string'
          ? item.text
          : ''
      })
      .join('')
    return { role, text }
  }
  return { role, text: '' }
}

function extractRequestedBetas(init: Record<string, JSONValue> | null): string[] {
  const requestedBetas = init?.custom_params
  if (!requestedBetas || typeof requestedBetas !== 'object') return []
  const betas = (requestedBetas as Record<string, JSONValue>)
    .noumena_requested_betas
  if (!Array.isArray(betas)) return []
  return betas.filter((beta): beta is string => typeof beta === 'string')
}

function extractContextManagementEditTypes(
  init: Record<string, JSONValue> | null,
): string[] {
  const customParams = init?.custom_params
  if (!customParams || typeof customParams !== 'object') return []
  const contextManagement = (customParams as Record<string, JSONValue>)
    .noumena_context_management
  if (!contextManagement || typeof contextManagement !== 'object') return []
  const edits = (contextManagement as Record<string, JSONValue>).edits
  if (!Array.isArray(edits)) return []
  return edits
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const type = (entry as Record<string, JSONValue>).type
      return typeof type === 'string' ? type : null
    })
    .filter((type): type is string => type !== null)
}

export function summarizeOpenAICompatDumpPromptsRequestShape(
  parsed: OpenAICompatReplayDumpPromptsFile,
  sourcePath: string = '<inline>',
): OpenAICompatDumpPromptsRequestShapeSummary {
  const { role, text } = extractMessageText(parsed.message)
  const toolNames = extractToolNames(parsed.init?.tools)
  const contextManagementEditTypes =
    extractContextManagementEditTypes(parsed.init)

  return {
    source_path: sourcePath,
    model: typeof parsed.init?.model === 'string' ? parsed.init.model : null,
    max_tokens:
      typeof parsed.init?.max_tokens === 'number' ? parsed.init.max_tokens : null,
    max_completion_tokens:
      typeof parsed.init?.max_completion_tokens === 'number'
        ? parsed.init.max_completion_tokens
        : null,
    stream: typeof parsed.init?.stream === 'boolean' ? parsed.init.stream : null,
    stream_reasoning:
      typeof parsed.init?.stream_reasoning === 'boolean'
        ? parsed.init.stream_reasoning
        : null,
    reasoning_effort:
      typeof parsed.init?.reasoning_effort === 'string'
        ? parsed.init.reasoning_effort
        : null,
    tool_names: toolNames,
    tool_count: toolNames.length,
    requested_betas: extractRequestedBetas(parsed.init),
    has_context_management: contextManagementEditTypes.length > 0,
    context_management_edit_types: contextManagementEditTypes,
    message_role: role,
    message_content_length: text.length,
    includes_parent_repo_agents: text.includes(
      'Contents of /mlstore/src/noumena/AGENTS.md',
    ),
    includes_ncode_agents: text.includes(
      'Contents of /mlstore/src/noumena/ncode/AGENTS.md',
    ),
    includes_claude_md: text.includes(
      'Contents of /mlstore/src/noumena/ncode/CLAUDE.md',
    ),
    message_tail: text.slice(-240),
  }
}

function mapInitToolsToInferenceTools(
  initTools: JSONValue | undefined,
): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(initTools) || initTools.length === 0) {
    return undefined
  }

  const mapped = initTools
    .map((entry) => {
      if (
        !entry ||
        typeof entry !== 'object' ||
        entry.type !== 'function' ||
        !entry.function ||
        typeof entry.function !== 'object'
      ) {
        return null
      }

      const fn = entry.function as {
        name?: unknown
        description?: unknown
        parameters?: unknown
      }
      if (typeof fn.name !== 'string') {
        return null
      }

      return {
        name: fn.name,
        description: typeof fn.description === 'string' ? fn.description : '',
        input_schema:
          fn.parameters && typeof fn.parameters === 'object'
            ? fn.parameters
            : { type: 'object', properties: {}, additionalProperties: false },
      }
    })
    .filter((tool): tool is Record<string, unknown> => tool !== null)

  return mapped.length > 0 ? mapped : undefined
}

export function deriveOpenAICompatReplayCreateMessageParams(
  init: Record<string, JSONValue> | null,
  receipt: OpenAICompatReplayReceipt,
): Record<string, unknown> {
  const firstChunk = receipt.response.data.chunks[0]
  const maxTokens =
    typeof init?.max_tokens === 'number'
      ? init.max_tokens
      : typeof init?.max_completion_tokens === 'number'
        ? init.max_completion_tokens
        : 64

  const params: Record<string, unknown> = {
    model:
      typeof init?.model === 'string'
        ? init.model
        : typeof firstChunk?.model === 'string'
          ? firstChunk.model
          : 'unknown',
    stream: true,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: 'replay streamed receipt' }],
  }

  const tools = mapInitToolsToInferenceTools(init?.tools)
  if (tools) {
    params.tools = tools
  }

  const reasoningDisabled =
    init?.reasoning_effort === 'none' ||
    (typeof init?.chat_template_kwargs === 'object' &&
      init.chat_template_kwargs !== null &&
      ((init.chat_template_kwargs as Record<string, JSONValue>).thinking === false ||
        (init.chat_template_kwargs as Record<string, JSONValue>).enable_thinking ===
          false))
  if (reasoningDisabled) {
    params.thinking = { type: 'disabled' }
  }

  return params
}

export async function collectOpenAICompatReplayEvents(
  receipt: OpenAICompatReplayReceipt,
  params: Record<string, unknown>,
  requestId?: string,
): Promise<{
  request_id: string | null
  events: Array<Record<string, unknown>>
}> {
  const client = new OpenAICompatInferenceClient({
    baseURL: 'http://example.test',
    fetch: async () => createOpenAICompatReplayResponse(receipt, requestId),
  })

  const operation = client.createMessage(params as never)
  const withResponse = await operation.withResponse()
  const events: Array<Record<string, unknown>> = []
  for await (const event of withResponse.data as AsyncIterable<Record<string, unknown>>) {
    events.push(event)
  }
  return {
    request_id: withResponse.request_id,
    events,
  }
}
