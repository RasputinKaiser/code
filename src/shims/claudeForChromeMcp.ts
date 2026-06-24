import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type JSONRPCMessage,
  JSONRPCMessageSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js'
import { randomUUID } from 'crypto'
import { createConnection, type Socket } from 'net'
import type WsWebSocket from 'ws'

export type PermissionMode =
  | 'ask'
  | 'skip_all_permission_checks'
  | 'follow_a_plan'

export type Logger = {
  silly(message: string, ...args: unknown[]): void
  debug(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}

export type ClaudeForChromeContext = {
  serverName: string
  logger: Logger
  socketPath: string
  getSocketPaths: () => string[]
  clientTypeId: string
  onAuthenticationError?: () => void
  onToolCallDisconnected?: () => string
  onExtensionPaired?: (deviceId: string, name: string) => void
  onRemoteExtensionWarning?: (extension: BridgeExtension) => void
  getPersistedDeviceId?: () => string | undefined
  bridgeConfig?: {
    url: string
    getUserId: () => Promise<string | undefined>
    getOAuthToken: () => Promise<string>
    devUserId?: string
  }
  initialPermissionMode?: PermissionMode
  callAnthropicMessages?: (req: unknown) => Promise<unknown>
  trackEvent?: (eventName: string, metadata?: Record<string, unknown>) => void
}

type BrowserTool = {
  name: string
  description: string
}

type JsonSchemaObject = {
  type: 'object'
  properties?: Record<string, unknown>
  required?: string[]
  additionalProperties?: boolean
}

type NotificationForwarder = (method: string, params: unknown) => void

const CONTROL_TOOL_NAMES = new Set(['set_permission_mode'])
const BRIDGE_ONLY_TOOL_NAMES = new Set(['switch_browser'])
const TOOL_LIST_CHANGED_METHODS = new Set([
  'notifications/tools/list_changed',
  'tools/list_changed',
  'notifications/tool_list_changed',
  'tool_list_changed',
])
const ANT_ONLY_LIGHTNING_TOOL_NAMES = new Set(['browser_task', 'lightning_turn'])
const BRIDGE_TOOL_CALL_TIMEOUT_MS = 120_000
const BRIDGE_CONNECT_TIMEOUT_MS = 10_000
const BRIDGE_DISCOVERY_TIMEOUT_MS = 2_000
const BRIDGE_PEER_CONNECTED_WAIT_MS = 2_000
const BRIDGE_TABS_CONTEXT_TIMEOUT_MS = 2_000
const BRIDGE_SWITCH_TIMEOUT_MS = 120_000
const BRIDGE_MAX_RECONNECT_ATTEMPTS = 100
const BRIDGE_RECONNECT_DELAY_MS = 1_000
const WS_READY_STATE_OPEN = 1

function stringSchema(description: string): Record<string, unknown> {
  return {
    type: 'string',
    description,
  }
}

function numberSchema(
  description: string,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    type: 'number',
    description,
    ...extra,
  }
}

function booleanSchema(description: string): Record<string, unknown> {
  return {
    type: 'boolean',
    description,
  }
}

const TOOL_DEFINITIONS: readonly BrowserTool[] = [
  { name: 'javascript_tool', description: 'Execute JavaScript code in the current tab.' },
  { name: 'read_page', description: 'Read accessibility-tree page content.' },
  { name: 'find', description: 'Find elements by natural-language query.' },
  { name: 'form_input', description: 'Set values in form elements.' },
  { name: 'computer', description: 'Drive mouse/keyboard browser actions.' },
  { name: 'navigate', description: 'Navigate to URL or browser history direction.' },
  { name: 'resize_window', description: 'Resize the browser window.' },
  { name: 'gif_creator', description: 'Manage browser GIF recording/export.' },
  { name: 'upload_image', description: 'Upload a captured or user image to the page.' },
  { name: 'get_page_text', description: 'Extract plain text from a page.' },
  { name: 'tabs_context_mcp', description: 'Get context for the MCP tab group.' },
  { name: 'tabs_create_mcp', description: 'Create a new tab in the MCP tab group.' },
  { name: 'update_plan', description: 'Present a plan for browser-domain approval.' },
  { name: 'read_console_messages', description: 'Read browser console messages.' },
  { name: 'read_network_requests', description: 'Read browser network requests.' },
  { name: 'shortcuts_list', description: 'List available browser shortcuts.' },
  { name: 'shortcuts_execute', description: 'Execute a browser shortcut.' },
  { name: 'switch_browser', description: 'Switch to another browser via bridge pairing.' },
]

export const BROWSER_TOOLS = TOOL_DEFINITIONS

const DEFAULT_TOOL_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: true,
} as const satisfies JsonSchemaObject

const TAB_ID_PROPERTY = {
  type: 'number',
  description:
    'Tab ID from tabs_context_mcp. Must be a tab in the current MCP tab group.',
}

const COMPUTER_ACTION_VALUES = [
  'left_click',
  'right_click',
  'double_click',
  'triple_click',
  'left_click_drag',
  'screenshot',
  'type',
  'key',
  'scroll',
  'wait',
  'zoom',
  'scroll_to',
  'hover',
] as const

const TOOL_INPUT_SCHEMAS: Readonly<Record<string, JsonSchemaObject>> = {
  javascript_tool: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['javascript_exec'],
        description: "Must be set to 'javascript_exec'.",
      },
      tabId: TAB_ID_PROPERTY,
      text: stringSchema(
        'JavaScript source to execute in the selected tab.',
      ),
    },
    required: ['action', 'text', 'tabId'],
    additionalProperties: true,
  },
  read_page: {
    type: 'object',
    properties: {
      filter: {
        type: 'string',
        enum: ['interactive', 'all'],
        description: 'Whether to return only interactive elements or all elements.',
      },
      tabId: TAB_ID_PROPERTY,
      depth: numberSchema('Maximum read depth.', { minimum: 0 }),
      ref_id: stringSchema(
        'Optional reference ID to scope the read to a specific element subtree.',
      ),
      max_chars: numberSchema('Maximum output characters.', { minimum: 1 }),
    },
    required: ['tabId'],
    additionalProperties: true,
  },
  find: {
    type: 'object',
    properties: {
      tabId: TAB_ID_PROPERTY,
      query: stringSchema(
        'Text or selector-like query to search for in the current page.',
      ),
    },
    required: ['query', 'tabId'],
    additionalProperties: true,
  },
  form_input: {
    type: 'object',
    properties: {
      tabId: TAB_ID_PROPERTY,
      ref: stringSchema('Element reference from read_page/find output.'),
      value: {
        type: ['string', 'boolean', 'number'],
        description: 'Value to set in the form element.',
      },
    },
    required: ['ref', 'value', 'tabId'],
    additionalProperties: true,
  },
  computer: {
    type: 'object',
    properties: {
      tabId: TAB_ID_PROPERTY,
      action: {
        type: 'string',
        enum: [...COMPUTER_ACTION_VALUES],
        description: 'Browser action to perform.',
      },
      ref: stringSchema('Optional page element reference for click-style actions.'),
      coordinate: {
        type: 'array',
        description: 'x/y coordinate pair.',
        minItems: 2,
        maxItems: 2,
        items: { type: 'number' },
      },
      start_coordinate: {
        type: 'array',
        description: 'x/y start coordinate for left_click_drag.',
        minItems: 2,
        maxItems: 2,
        items: { type: 'number' },
      },
      region: {
        type: 'array',
        description: 'x0,y0,x1,y1 region for zoom.',
        minItems: 4,
        maxItems: 4,
        items: { type: 'number' },
      },
      text: stringSchema(
        'Text payload for type/key actions.',
      ),
      scroll_direction: stringSchema(
        'Scroll direction for scroll actions.',
      ),
      scroll_amount: numberSchema('Scroll tick amount.', { minimum: 1, maximum: 10 }),
      duration: numberSchema(
        'Wait duration in seconds.',
        { minimum: 0, maximum: 30 },
      ),
      repeat: numberSchema('Repeat count for key actions.', { minimum: 1, maximum: 100 }),
      modifiers: stringSchema('Modifier keys for click actions.'),
    },
    required: ['action', 'tabId'],
    additionalProperties: true,
  },
  navigate: {
    type: 'object',
    properties: {
      tabId: TAB_ID_PROPERTY,
      url: {
        type: 'string',
        format: 'uri',
        description: 'Absolute URL to navigate the browser tab to.',
      },
    },
    required: ['url', 'tabId'],
    additionalProperties: true,
  },
  resize_window: {
    type: 'object',
    properties: {
      width: numberSchema('Target browser window width in pixels.', {
        minimum: 1,
      }),
      height: numberSchema('Target browser window height in pixels.', {
        minimum: 1,
      }),
      tabId: TAB_ID_PROPERTY,
    },
    required: ['width', 'height', 'tabId'],
    additionalProperties: true,
  },
  gif_creator: {
    type: 'object',
    properties: {
      action: stringSchema(
        'GIF recorder action, such as starting or stopping a browser capture sequence.',
      ),
      tabId: TAB_ID_PROPERTY,
      download: booleanSchema(
        "Whether export should download the GIF in-browser (for 'export' action).",
      ),
      filename: stringSchema(
        'Optional output filename for export.',
      ),
      options: {
        type: 'object',
        description: 'Optional overlay and quality controls for GIF export.',
        additionalProperties: true,
      },
    },
    required: ['action', 'tabId'],
    additionalProperties: true,
  },
  upload_image: {
    type: 'object',
    properties: {
      imageId: stringSchema('Captured screenshot/user image ID.'),
      tabId: TAB_ID_PROPERTY,
      ref: stringSchema('Element reference for upload target.'),
      coordinate: {
        type: 'array',
        items: { type: 'number' },
        minItems: 2,
        maxItems: 2,
      },
      filename: stringSchema('Optional uploaded filename.'),
    },
    required: ['imageId', 'tabId'],
    additionalProperties: true,
  },
  get_page_text: {
    type: 'object',
    properties: {
      tabId: TAB_ID_PROPERTY,
    },
    required: ['tabId'],
    additionalProperties: true,
  },
  tabs_context_mcp: {
    type: 'object',
    properties: {
      createIfEmpty: booleanSchema(
        'Create an empty tab group when none exists.',
      ),
    },
    required: [],
    additionalProperties: true,
  },
  tabs_create_mcp: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: true,
  },
  update_plan: {
    type: 'object',
    properties: {
      domains: {
        type: 'array',
        items: { type: 'string' },
        description: 'Domains covered by this plan update.',
      },
      approach: {
        type: 'array',
        items: { type: 'string' },
        description: 'High-level plan steps.',
      },
    },
    required: ['domains', 'approach'],
    additionalProperties: true,
  },
  read_console_messages: {
    type: 'object',
    properties: {
      tabId: TAB_ID_PROPERTY,
      pattern: stringSchema(
        'Regex-compatible filter applied to console messages before returning them.',
      ),
      onlyErrors: booleanSchema('When true, only console errors are returned.'),
      clear: booleanSchema('Clear buffered console messages after reading.'),
      limit: numberSchema('Maximum number of console messages.', { minimum: 1 }),
    },
    required: ['tabId'],
    additionalProperties: true,
  },
  read_network_requests: {
    type: 'object',
    properties: {
      tabId: TAB_ID_PROPERTY,
      urlPattern: stringSchema(
        'Optional pattern used to filter the returned network requests.',
      ),
      clear: booleanSchema('Clear buffered requests after reading.'),
      limit: numberSchema('Maximum number of network requests.', { minimum: 1 }),
    },
    required: ['tabId'],
    additionalProperties: true,
  },
  shortcuts_list: {
    type: 'object',
    properties: {
      tabId: TAB_ID_PROPERTY,
    },
    required: ['tabId'],
    additionalProperties: true,
  },
  shortcuts_execute: {
    type: 'object',
    properties: {
      tabId: TAB_ID_PROPERTY,
      shortcutId: stringSchema('Shortcut identifier returned by shortcuts_list.'),
      command: stringSchema('Shortcut command name.'),
    },
    required: ['tabId'],
    additionalProperties: true,
  },
  switch_browser: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: true,
  },
}

const TOOL_DEFINITION_MAP = new Map(
  TOOL_DEFINITIONS.map(tool => [tool.name, tool]),
)

function applyToolSchemaOverride(tool: Tool): Tool {
  const fallback = TOOL_DEFINITION_MAP.get(tool.name)
  const incomingSchema = tool.inputSchema as Record<string, unknown> | undefined
  const hasIncomingProperties =
    incomingSchema &&
    typeof incomingSchema.properties === 'object' &&
    incomingSchema.properties !== null &&
    Object.keys(incomingSchema.properties).length > 0
  const hasIncomingRequired =
    incomingSchema &&
    Array.isArray(incomingSchema.required) &&
    incomingSchema.required.length > 0
  const schema =
    hasIncomingProperties || hasIncomingRequired
      ? (incomingSchema as JsonSchemaObject)
      : (TOOL_INPUT_SCHEMAS[tool.name] ?? DEFAULT_TOOL_INPUT_SCHEMA)
  return {
    ...tool,
    ...(fallback && !tool.description ? { description: fallback.description } : {}),
    inputSchema: schema,
  }
}

const FALLBACK_TOOL_RECORDS: readonly Tool[] = TOOL_DEFINITIONS.map(tool =>
  applyToolSchemaOverride({
    name: tool.name,
    description: tool.description,
    inputSchema: TOOL_INPUT_SCHEMAS[tool.name] ?? DEFAULT_TOOL_INPUT_SCHEMA,
  }),
)

const TOOL_CALL_TIMEOUT_MS = 45_000
const CONNECT_TIMEOUT_MS = 1_500

function unavailableMessage(context: ClaudeForChromeContext, toolName: string): string {
  const detail = context.onToolCallDisconnected?.()
  return (
    detail ??
    `${context.serverName} tool \"${toolName}\" is unavailable in this reconstructed build.`
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNotification(message: JSONRPCMessage): message is JSONRPCMessage & {
  method: string
  params?: unknown
} {
  return (
    isRecord(message) &&
    typeof message.method === 'string' &&
    !('id' in message)
  )
}

function getStringField(
  params: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = params[key]
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
  }
  return undefined
}

function extractTextFromToolResult(result: unknown): string[] {
  const normalized = toMcpToolResult(result)
  if (!normalized) {
    return []
  }
  const texts: string[] = []
  for (const item of normalized.content) {
    if (
      isRecord(item) &&
      item.type === 'text' &&
      typeof item.text === 'string'
    ) {
      texts.push(item.text)
    }
  }
  return texts
}

function normalizeToolResultContentItem(item: unknown): unknown {
  if (
    isRecord(item) &&
    item.type === 'image' &&
    isRecord(item.source) &&
    typeof item.source.data === 'string'
  ) {
    return {
      type: 'image',
      data: item.source.data,
      mimeType:
        typeof item.source.media_type === 'string'
          ? item.source.media_type
          : 'image/png',
    }
  }
  if (isRecord(item) && typeof item.type === 'string') {
    return item
  }
  return {
    type: 'text',
    text: String(item),
  }
}

function toMcpToolResult(result: unknown):
  | {
      content: unknown[]
      isError?: boolean
      structuredContent?: unknown
    }
  | null {
  if (isRecord(result) && Array.isArray(result.content)) {
    return {
      content: result.content.map(normalizeToolResultContentItem),
      ...(result.isError === true || result.is_error === true
        ? { isError: true }
        : {}),
      ...(result.structuredContent !== undefined
        ? { structuredContent: result.structuredContent }
        : {}),
    }
  }
  if (
    isRecord(result) &&
    isRecord(result.result) &&
    Array.isArray(result.result.content)
  ) {
    return {
      content: result.result.content.map(normalizeToolResultContentItem),
      ...(result.result.structuredContent !== undefined
        ? { structuredContent: result.result.structuredContent }
        : {}),
    }
  }
  if (
    isRecord(result) &&
    isRecord(result.error) &&
    Array.isArray(result.error.content)
  ) {
    return {
      content: result.error.content.map(normalizeToolResultContentItem),
      isError: true,
      ...(result.error.structuredContent !== undefined
        ? { structuredContent: result.error.structuredContent }
        : {}),
    }
  }
  return null
}

function makeTextToolResult(
  text: string,
  options?: { isError?: boolean },
): {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
} {
  return {
    content: [{ type: 'text', text }],
    ...(options?.isError ? { isError: true } : {}),
  }
}

function parsePermissionMode(args: Record<string, unknown>): PermissionMode | undefined {
  const raw = args.mode
  if (
    raw === 'ask' ||
    raw === 'skip_all_permission_checks' ||
    raw === 'follow_a_plan'
  ) {
    return raw
  }
  return undefined
}

function parseAllowedDomains(args: Record<string, unknown>): string[] | undefined {
  const arrayRaw =
    (Array.isArray(args.allowedDomains) ? args.allowedDomains : undefined) ??
    (Array.isArray(args.allowed_domains) ? args.allowed_domains : undefined)
  const stringRaw =
    (typeof args.allowedDomains === 'string' ? args.allowedDomains : undefined) ??
    (typeof args.allowed_domains === 'string' ? args.allowed_domains : undefined)
  const values = [
    ...(arrayRaw ?? []),
    ...(typeof stringRaw === 'string' ? stringRaw.split(/[,\s]+/g) : []),
  ]
  const domains = values
    .filter((domain): domain is string => typeof domain === 'string')
    .map(domain => domain.trim().toLowerCase())
    .filter(domain => domain.length > 0)
  return domains.length > 0 ? [...new Set(domains)] : undefined
}

function isAuthFailureText(text: string): boolean {
  const normalized = text.toLowerCase()
  return (
    normalized.includes('re-authenticated') ||
    normalized.includes('authentication') ||
    (normalized.includes('logged into') &&
      normalized.includes('claude') &&
      normalized.includes('account'))
  )
}

function classifyToolCallError(error: unknown): 'timeout' | 'tool_call_failed' | 'unknown' {
  if (!(error instanceof Error)) {
    return 'unknown'
  }
  const normalized = error.message.toLowerCase()
  if (normalized.includes('timeout') || normalized.includes('timed out')) {
    return 'timeout'
  }
  return 'tool_call_failed'
}

function normalizeTools(tools: unknown[]): Tool[] {
  const normalized: Tool[] = []
  for (const item of tools) {
    if (!isRecord(item)) {
      continue
    }
    const name = item.name
    const inputSchema =
      (isRecord(item.inputSchema) ? item.inputSchema : undefined) ??
      (isRecord(item.input_schema) ? item.input_schema : undefined)
    if (typeof name !== 'string' || !isRecord(inputSchema)) {
      continue
    }
    const description =
      typeof item.description === 'string' ? item.description : undefined
    normalized.push({
      ...item,
      name,
      ...(description !== undefined && { description }),
      inputSchema,
    } as Tool)
  }
  return normalized.map(applyToolSchemaOverride)
}

function isToolListChangedMethod(method: string): boolean {
  const normalized = method.toLowerCase()
  if (TOOL_LIST_CHANGED_METHODS.has(normalized)) {
    return true
  }
  return TOOL_LIST_CHANGED_METHODS.has(normalized.replace(/_/g, '/'))
}

function filterVisibleToolsForContext(
  tools: Tool[],
  context: ClaudeForChromeContext,
): Tool[] {
  let filtered = tools
  if (!context.bridgeConfig) {
    filtered = filtered.filter(tool => !BRIDGE_ONLY_TOOL_NAMES.has(tool.name))
  }
  if (context.callAnthropicMessages) {
    return filtered
  }
  return filtered.filter(tool => !ANT_ONLY_LIGHTNING_TOOL_NAMES.has(tool.name))
}

function hasFallbackToolNamesOnly(tools: Tool[]): boolean {
  if (tools.length !== TOOL_DEFINITIONS.length) {
    return false
  }
  return tools.every(tool => TOOL_DEFINITION_MAP.has(tool.name))
}

function extractBridgeNotification(
  message: Record<string, unknown>,
): { method: string; params: unknown } | null {
  const candidates: Record<string, unknown>[] = [message]
  if (isRecord(message.notification)) {
    candidates.push(message.notification)
  }
  if (isRecord(message.payload)) {
    candidates.push(message.payload)
  }
  if (isRecord(message.data)) {
    candidates.push(message.data)
  }

  for (const candidate of candidates) {
    const method = getStringField(candidate, ['method', 'notification'])
    if (!method) {
      continue
    }
    const params =
      candidate.params ?? candidate.payload ?? candidate.data ?? message.params
    return { method, params }
  }
  return null
}

class SocketMcpTransport implements Transport {
  private socket: Socket | null = null
  private readBuffer = Buffer.alloc(0)
  private started = false
  private closed = false

  onclose?: () => void
  onerror?: (error: Error) => void
  onmessage?: (message: JSONRPCMessage) => void

  constructor(
    private readonly socketPath: string,
    private readonly logger: Logger,
    private readonly onNotification?: (method: string, params: unknown) => void,
  ) {}

  async start(): Promise<void> {
    if (this.started) {
      throw new Error('Start can only be called once per transport.')
    }
    this.started = true

    await new Promise<void>((resolve, reject) => {
      const socket = createConnection(this.socketPath)
      this.socket = socket

      let timeoutId: NodeJS.Timeout | undefined
      const onError = (error: Error) => {
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = undefined
        }
        socket.off('connect', onConnect)
        reject(error)
      }
      const onConnect = () => {
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = undefined
        }
        socket.off('error', onError)
        resolve()
      }

      socket.once('error', onError)
      socket.once('connect', onConnect)

      timeoutId = setTimeout(() => {
        socket.destroy(new Error('Connection timeout'))
      }, CONNECT_TIMEOUT_MS)
      timeoutId.unref?.()
    })

    const socket = this.socket
    if (!socket) {
      throw new Error('Socket is not connected')
    }

    socket.on('data', chunk => this.handleData(chunk))
    socket.on('error', error => {
      this.onerror?.(error)
    })
    socket.on('close', () => {
      this.handleClosed()
    })
  }

  async close(): Promise<void> {
    this.handleClosed()
    const socket = this.socket
    if (!socket) {
      return
    }
    this.socket = null
    await new Promise<void>(resolve => {
      if (socket.destroyed) {
        resolve()
        return
      }
      socket.once('close', () => resolve())
      socket.end()
      const timeoutId = setTimeout(() => {
        socket.destroy()
      }, 100)
      timeoutId.unref?.()
    })
  }

  async send(message: JSONRPCMessage): Promise<void> {
    const socket = this.socket
    if (!socket || socket.destroyed) {
      throw new Error('Socket is not connected')
    }

    const payload = Buffer.from(JSON.stringify(message), 'utf-8')
    const length = Buffer.alloc(4)
    length.writeUInt32LE(payload.length, 0)
    const frame = Buffer.concat([length, payload])

    await new Promise<void>((resolve, reject) => {
      socket.write(frame, error => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  }

  private handleData(chunk: Buffer): void {
    this.readBuffer = Buffer.concat([this.readBuffer, chunk])

    while (this.readBuffer.length >= 4) {
      const messageLength = this.readBuffer.readUInt32LE(0)
      if (messageLength <= 0 || messageLength > 10 * 1024 * 1024) {
        this.onerror?.(
          new Error(`Invalid frame length on Chrome MCP socket: ${messageLength}`),
        )
        void this.close()
        return
      }
      if (this.readBuffer.length < 4 + messageLength) {
        return
      }

      const payload = this.readBuffer.subarray(4, 4 + messageLength)
      this.readBuffer = this.readBuffer.subarray(4 + messageLength)

      try {
        const parsed = JSON.parse(payload.toString('utf-8'))
        const message = JSONRPCMessageSchema.parse(parsed)
        if (isNotification(message)) {
          this.onNotification?.(message.method, message.params)
        }
        this.onmessage?.(message)
      } catch (error) {
        this.logger.debug(
          '[claude-for-chrome-mcp replacement] invalid socket payload: %s',
          error instanceof Error ? error.message : String(error),
        )
        this.onerror?.(
          error instanceof Error ? error : new Error('Invalid JSON-RPC message'),
        )
      }
    }
  }

  private handleClosed(): void {
    if (this.closed) {
      return
    }
    this.closed = true
    this.onclose?.()
  }
}

class ChromeBridgeUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ChromeBridgeUnavailableError'
  }
}

type ChromeProxySession = {
  client: Client
  transport: SocketMcpTransport
  socketPath: string
}

type BridgeExtension = {
  deviceId: string
  name?: string
  connectedAt?: number
  osPlatform?: string
}

type BridgePermissionRequest = {
  toolUseId: string
  requestId: string
  toolType: string
  url: string
  actionData?: unknown
}

type SwitchBrowserSelection = {
  deviceId: string
  name: string
}

type PendingBridgeCall = {
  toolName: string
  startedAt: number
  timeoutId: NodeJS.Timeout
  isTabsContext: boolean
  onPermissionRequest?: (
    request: BridgePermissionRequest,
  ) => Promise<boolean> | boolean
  results: Array<{
    content: unknown[]
    isError?: boolean
    structuredContent?: unknown
  }>
  resolve: (result: {
    content: unknown[]
    isError?: boolean
    structuredContent?: unknown
  }) => void
  reject: (error: Error) => void
}

class ChromeBridgeProxy {
  private ws: WsWebSocket | null = null
  private connectPromise: Promise<void> | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private reconnectAttempts = 0
  private connectionStartTime: number | null = null
  private connectionEstablishedTime: number | null = null
  private pendingConnect:
    | {
        resolve: () => void
        reject: (error: Error) => void
        timeoutId: NodeJS.Timeout
      }
    | null = null
  private pendingDiscovery:
    | {
        resolve: (extensions: BridgeExtension[]) => void
        timeoutId: NodeJS.Timeout
      }
    | null = null
  private pendingCalls = new Map<string, PendingBridgeCall>()
  private permissionMode: PermissionMode
  private allowedDomains: string[] | undefined
  private connected = false
  private authenticated = false
  private discoveryComplete = false
  private selectedDeviceId: string | undefined
  private previousSelectedDeviceId: string | undefined
  private peerConnectedWaiters: Array<(connected: boolean) => void> = []
  private pairingInProgress = false
  private pendingPairingRequestId: string | undefined
  private pendingSwitchResolve:
    | ((selection: SwitchBrowserSelection | null) => void)
    | null = null

  constructor(
    private readonly context: ClaudeForChromeContext,
    private readonly forwardNotification?: NotificationForwarder,
  ) {
    this.permissionMode = context.initialPermissionMode ?? 'ask'
    this.selectedDeviceId = context.getPersistedDeviceId?.()
  }

  async listTools(): Promise<Tool[]> {
    return filterVisibleToolsForContext([...FALLBACK_TOOL_RECORDS], this.context)
  }

  async setPermissionMode(
    permissionMode: PermissionMode,
    allowedDomains?: string[],
  ): Promise<void> {
    this.permissionMode = permissionMode
    this.allowedDomains = allowedDomains
  }

  async switchBrowser(): Promise<SwitchBrowserSelection | 'no_other_browsers' | null> {
    await this.ensureConnected()
    const extensions = await this.queryExtensions()
    const currentDeviceId = this.selectedDeviceId ?? this.previousSelectedDeviceId
    if (
      extensions.length === 0 ||
      (extensions.length === 1 &&
        (!currentDeviceId || extensions[0]?.deviceId === currentDeviceId))
    ) {
      return 'no_other_browsers'
    }

    this.previousSelectedDeviceId = this.selectedDeviceId
    this.selectedDeviceId = undefined
    this.discoveryComplete = false
    this.pairingInProgress = false

    const ws = this.ws
    if (!ws || ws.readyState !== WS_READY_STATE_OPEN) {
      return null
    }

    const requestId = randomUUID()
    this.pendingPairingRequestId = requestId
    ws.send(
      JSON.stringify({
        type: 'pairing_request',
        request_id: requestId,
        client_type: this.context.clientTypeId,
      }),
    )

    if (this.pendingSwitchResolve) {
      this.pendingSwitchResolve(null)
      this.pendingSwitchResolve = null
    }

    return await new Promise<SwitchBrowserSelection | null>(resolve => {
      const timeoutId = setTimeout(() => {
        if (this.pendingPairingRequestId === requestId) {
          this.pendingPairingRequestId = undefined
        }
        if (this.pendingSwitchResolve) {
          this.pendingSwitchResolve = null
        }
        resolve(null)
      }, BRIDGE_SWITCH_TIMEOUT_MS)
      timeoutId.unref?.()
      this.pendingSwitchResolve = selection => {
        clearTimeout(timeoutId)
        this.pendingSwitchResolve = null
        resolve(selection)
      }
    })
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<{
    content: unknown[]
    isError?: boolean
    structuredContent?: unknown
  }> {
    await this.ensureConnected()
    await this.ensureExtensionSelection()

    const ws = this.ws
    if (!ws || ws.readyState !== WS_READY_STATE_OPEN) {
      throw new ChromeBridgeUnavailableError('Chrome bridge is not connected')
    }

    const requestId = randomUUID()
    const timeoutMs =
      toolName === 'tabs_context_mcp' && !this.selectedDeviceId
        ? BRIDGE_TABS_CONTEXT_TIMEOUT_MS
        : BRIDGE_TOOL_CALL_TIMEOUT_MS

    this.context.trackEvent?.('chrome_bridge_tool_call_started', {
      status: 'bridge',
      tool_name: toolName,
    })

    return await new Promise<{
      content: unknown[]
      isError?: boolean
      structuredContent?: unknown
    }>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const pending = this.pendingCalls.get(requestId)
        if (!pending) {
          return
        }
        this.pendingCalls.delete(requestId)
        const durationMs = Date.now() - pending.startedAt
        if (pending.isTabsContext) {
          this.context.trackEvent?.('chrome_bridge_tool_call_completed', {
            status: 'bridge',
            tool_name: toolName,
            duration_ms: durationMs,
          })
          resolve(mergeTabsContextResults(pending.results))
          return
        }
        this.context.trackEvent?.('chrome_bridge_tool_call_timeout', {
          status: 'bridge',
          tool_name: toolName,
          duration_ms: durationMs,
          timeout_ms: timeoutMs,
        })
        reject(
          new Error(
            `[${this.context.serverName}] Tool call timed out: ${toolName}`,
          ),
        )
      }, timeoutMs)
      timeoutId.unref?.()

      this.pendingCalls.set(requestId, {
        toolName,
        startedAt: Date.now(),
        timeoutId,
        isTabsContext: toolName === 'tabs_context_mcp' && !this.selectedDeviceId,
        onPermissionRequest: undefined,
        results: [],
        resolve,
        reject,
      })

      const payload: Record<string, unknown> = {
        type: 'tool_call',
        tool_use_id: requestId,
        client_type: this.context.clientTypeId,
        tool: toolName,
        args,
        permission_mode: this.permissionMode,
      }
      if (this.selectedDeviceId) {
        payload.target_device_id = this.selectedDeviceId
      }
      if (this.allowedDomains && this.allowedDomains.length > 0) {
        payload.allowed_domains = this.allowedDomains
      }

      try {
        ws.send(JSON.stringify(payload))
      } catch (error) {
        clearTimeout(timeoutId)
        this.pendingCalls.delete(requestId)
        reject(
          error instanceof Error ? error : new Error('Failed to send bridge tool call'),
        )
      }
    })
  }

  private async ensureConnected(): Promise<void> {
    if (this.connected && this.authenticated && this.ws?.readyState === WS_READY_STATE_OPEN) {
      return
    }
    if (this.connectPromise) {
      return await this.connectPromise
    }
    this.connectPromise = this.connect()
    try {
      await this.connectPromise
    } finally {
      this.connectPromise = null
    }
  }

  private async connect(): Promise<void> {
    const bridgeConfig = this.context.bridgeConfig
    if (!bridgeConfig) {
      throw new ChromeBridgeUnavailableError('No Chrome bridge configuration available')
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.connectionStartTime = Date.now()

    const userId =
      bridgeConfig.devUserId !== undefined
        ? bridgeConfig.devUserId
        : await bridgeConfig.getUserId()
    if (!userId) {
      this.context.trackEvent?.('chrome_bridge_connection_failed', {
        status: 'bridge',
        duration_ms: Date.now() - this.connectionStartTime,
        error_type: 'no_user_id',
        reconnect_attempt: this.reconnectAttempts,
      })
      this.context.onAuthenticationError?.()
      throw new ChromeBridgeUnavailableError('No Chrome bridge user ID available')
    }

    const oauthToken =
      bridgeConfig.devUserId !== undefined
        ? undefined
        : await bridgeConfig.getOAuthToken()
    if (bridgeConfig.devUserId === undefined && !oauthToken) {
      this.context.trackEvent?.('chrome_bridge_connection_failed', {
        status: 'bridge',
        duration_ms: Date.now() - this.connectionStartTime,
        error_type: 'no_oauth_token',
        reconnect_attempt: this.reconnectAttempts,
      })
      this.context.onAuthenticationError?.()
      throw new ChromeBridgeUnavailableError('No Chrome bridge OAuth token available')
    }

    const bridgeUrl = `${bridgeConfig.url.replace(/\/+$/, '')}/chrome/${userId}`
    const { default: WebSocket } = await import('ws')

    this.closeBridgeSocket()
    this.connected = false
    this.authenticated = false
    this.discoveryComplete = false
    this.context.trackEvent?.('chrome_bridge_connection_started', {
      status: 'bridge',
      reconnect_attempt: this.reconnectAttempts,
    })

    const ws: WsWebSocket = new WebSocket(bridgeUrl)
    this.ws = ws

    ws.on('open', () => {
      const connectPayload: Record<string, unknown> = {
        type: 'connect',
        client_type: this.context.clientTypeId,
      }
      if (bridgeConfig.devUserId !== undefined) {
        connectPayload.dev_user_id = bridgeConfig.devUserId
      } else {
        connectPayload.oauth_token = oauthToken
      }
      ws.send(JSON.stringify(connectPayload))
    })
    ws.on('message', data => {
      this.handleBridgeMessage(data)
    })
    ws.on('error', error => {
      this.handleBridgeError(error)
    })
    ws.on('close', code => {
      this.handleBridgeClose(code)
    })

    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.finishPendingConnect(
          new ChromeBridgeUnavailableError('Chrome bridge connection timed out'),
        )
      }, BRIDGE_CONNECT_TIMEOUT_MS)
      timeoutId.unref?.()
      this.pendingConnect = { resolve, reject, timeoutId }
    })
  }

  private async ensureExtensionSelection(): Promise<void> {
    if (this.selectedDeviceId || this.discoveryComplete) {
      return
    }

    let extensions = await this.queryExtensions()
    if (extensions.length === 0) {
      this.context.logger.info(
        '[claude-for-chrome-mcp replacement] no bridge extensions connected, waiting up to %dms for peer_connected',
        BRIDGE_PEER_CONNECTED_WAIT_MS,
      )
      if (await this.waitForPeerConnected(BRIDGE_PEER_CONNECTED_WAIT_MS)) {
        extensions = await this.queryExtensions()
      }
    }
    this.discoveryComplete = true

    if (extensions.length === 0) {
      this.context.logger.info(
        '[claude-for-chrome-mcp replacement] no bridge extensions found after waiting',
      )
      return
    }

    if (extensions.length === 1) {
      const [extension] = extensions
      if (extension && !this.isLocalExtension(extension)) {
        this.context.onRemoteExtensionWarning?.(extension)
      }
      if (extension) {
        this.selectExtension(extension.deviceId)
      }
      return
    }

    const persistedDeviceId = this.context.getPersistedDeviceId?.()
    const persisted = persistedDeviceId
      ? extensions.find(extension => extension.deviceId === persistedDeviceId)
      : undefined
    if (persisted) {
      this.selectExtension(persisted.deviceId)
      return
    }

    this.broadcastPairingRequest()
    this.pairingInProgress = true
  }

  private async queryExtensions(): Promise<BridgeExtension[]> {
    const ws = this.ws
    if (!ws || ws.readyState !== WS_READY_STATE_OPEN) {
      throw new ChromeBridgeUnavailableError('Chrome bridge is not connected')
    }

    return await new Promise<BridgeExtension[]>(resolve => {
      if (this.pendingDiscovery) {
        clearTimeout(this.pendingDiscovery.timeoutId)
      }
      const timeoutId = setTimeout(() => {
        if (this.pendingDiscovery?.resolve === resolve) {
          this.pendingDiscovery = null
        }
        resolve([])
      }, BRIDGE_DISCOVERY_TIMEOUT_MS)
      timeoutId.unref?.()
      this.pendingDiscovery = { resolve, timeoutId }
      ws.send(JSON.stringify({ type: 'list_extensions' }))
    })
  }

  private broadcastPairingRequest(): void {
    const ws = this.ws
    if (!ws || ws.readyState !== WS_READY_STATE_OPEN) {
      return
    }
    const requestId = randomUUID()
    this.pendingPairingRequestId = requestId
    ws.send(
      JSON.stringify({
        type: 'pairing_request',
        request_id: requestId,
        client_type: this.context.clientTypeId,
      }),
    )
  }

  private selectExtension(deviceId: string): void {
    this.selectedDeviceId = deviceId
    this.previousSelectedDeviceId = undefined
  }

  private isLocalExtension(extension: BridgeExtension): boolean {
    const localPlatform =
      process.platform === 'darwin'
        ? 'macOS'
        : process.platform === 'win32'
          ? 'Windows'
          : 'Linux'
    return extension.osPlatform === localPlatform
  }

  private waitForPeerConnected(timeoutMs: number): Promise<boolean> {
    return new Promise(resolve => {
      const timeoutId = setTimeout(() => {
        this.peerConnectedWaiters = this.peerConnectedWaiters.filter(
          waiter => waiter !== onPeerConnected,
        )
        resolve(false)
      }, timeoutMs)
      timeoutId.unref?.()
      const onPeerConnected = (connected: boolean) => {
        clearTimeout(timeoutId)
        resolve(connected)
      }
      this.peerConnectedWaiters.push(onPeerConnected)
    })
  }

  private handleBridgeMessage(data: unknown): void {
    let message: Record<string, unknown>
    try {
      const payload =
        typeof data === 'string'
          ? data
          : Array.isArray(data)
            ? Buffer.concat(data).toString('utf-8')
            : data instanceof ArrayBuffer
              ? Buffer.from(data).toString('utf-8')
              : ArrayBuffer.isView(data)
                ? Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString(
                    'utf-8',
                  )
                : Buffer.isBuffer(data)
                  ? data.toString('utf-8')
                  : String(data)
      const parsed = JSON.parse(payload)
      if (!isRecord(parsed)) {
        return
      }
      message = parsed
    } catch (error) {
      this.context.logger.debug(
        '[claude-for-chrome-mcp replacement] invalid bridge payload: %s',
        error instanceof Error ? error.message : String(error),
      )
      return
    }

    switch (message.type) {
      case 'paired':
      case 'waiting':
        this.connected = true
        this.authenticated = true
        this.reconnectAttempts = 0
        this.connectionEstablishedTime = Date.now()
        this.context.trackEvent?.('chrome_bridge_connection_succeeded', {
          status: String(message.type),
          duration_ms:
            this.connectionStartTime === null
              ? undefined
              : Date.now() - this.connectionStartTime,
        })
        this.finishPendingConnect()
        return
      case 'extensions_list': {
        const extensions = normalizeBridgeExtensions(message.extensions)
        if (this.pendingDiscovery) {
          clearTimeout(this.pendingDiscovery.timeoutId)
          const { resolve } = this.pendingDiscovery
          this.pendingDiscovery = null
          resolve(extensions)
        }
        return
      }
      case 'pairing_response': {
        const deviceId = getStringField(message, ['device_id', 'deviceId'])
        const name = getStringField(message, ['name', 'device_name', 'deviceName'])
        const requestId = getStringField(message, ['request_id', 'requestId'])
        const requestMatches =
          !requestId ||
          !this.pendingPairingRequestId ||
          requestId === this.pendingPairingRequestId
        if (requestMatches && deviceId) {
          this.pendingPairingRequestId = undefined
          this.pairingInProgress = false
          this.selectExtension(deviceId)
          this.discoveryComplete = true
          if (name) {
            this.context.onExtensionPaired?.(deviceId, name)
          }
          if (this.pendingSwitchResolve) {
            this.pendingSwitchResolve(name ? { deviceId, name } : null)
            this.pendingSwitchResolve = null
          }
        }
        return
      }
      case 'peer_connected': {
        const deviceId = getStringField(message, ['device_id', 'deviceId'])
        this.context.trackEvent?.('chrome_bridge_peer_connected', {
          status: 'bridge',
        })
        if (
          this.previousSelectedDeviceId &&
          deviceId === this.previousSelectedDeviceId &&
          !this.pendingSwitchResolve
        ) {
          this.selectExtension(this.previousSelectedDeviceId)
          this.previousSelectedDeviceId = undefined
        } else if (!this.selectedDeviceId) {
          this.discoveryComplete = false
        }
        if (this.peerConnectedWaiters.length > 0) {
          const waiters = this.peerConnectedWaiters
          this.peerConnectedWaiters = []
          for (const waiter of waiters) {
            waiter(true)
          }
        }
        return
      }
      case 'peer_disconnected': {
        const deviceId = getStringField(message, ['device_id', 'deviceId'])
        this.context.trackEvent?.('chrome_bridge_peer_disconnected', {
          status: 'bridge',
        })
        if (deviceId && deviceId === this.selectedDeviceId) {
          this.previousSelectedDeviceId = this.selectedDeviceId
          this.selectedDeviceId = undefined
          this.discoveryComplete = false
        }
        return
      }
      case 'ping':
        this.ws?.send(JSON.stringify({ type: 'pong' }))
        return
      case 'tool_result':
        this.handleBridgeToolResult(message)
        return
      case 'permission_request':
        void this.handleBridgePermissionRequest(message)
        return
      case 'notification': {
        const notification = extractBridgeNotification(message)
        if (notification) {
          const { method, params } = notification
          if (method.toLowerCase().includes('auth')) {
            this.context.onAuthenticationError?.()
          }
          this.forwardNotification?.(method, params)
        }
        return
      }
      case 'error': {
        const errorType = getStringField(message, ['error_type', 'errorType'])
        if (errorType === 'auth' || errorType === 'authentication') {
          this.context.onAuthenticationError?.()
        }
        return
      }
      default:
        return
    }
  }

  private async handleBridgePermissionRequest(
    message: Record<string, unknown>,
  ): Promise<void> {
    const toolUseId = getStringField(message, ['tool_use_id', 'toolUseId'])
    const requestId = getStringField(message, ['request_id', 'requestId'])
    if (!toolUseId || !requestId) {
      this.context.logger.warn(
        '[claude-for-chrome-mcp replacement] permission_request missing tool_use_id or request_id',
      )
      return
    }
    const pending = this.pendingCalls.get(toolUseId)
    if (!pending?.onPermissionRequest) {
      this.context.logger.debug(
        '[claude-for-chrome-mcp replacement] ignoring permission_request for unknown bridge call %s',
        toolUseId,
      )
      return
    }
    const request: BridgePermissionRequest = {
      toolUseId,
      requestId,
      toolType:
        getStringField(message, ['tool_type', 'toolType']) ?? 'unknown',
      url: getStringField(message, ['url']) ?? '',
      actionData: message.action_data ?? message.actionData,
    }
    try {
      const allowed = await pending.onPermissionRequest(request)
      this.sendPermissionResponse(requestId, Boolean(allowed))
    } catch (error) {
      this.context.logger.error(
        '[claude-for-chrome-mcp replacement] error handling permission_request: %s',
        error instanceof Error ? error.message : String(error),
      )
      this.sendPermissionResponse(requestId, false)
    }
  }

  private sendPermissionResponse(requestId: string, allowed: boolean): void {
    if (this.ws?.readyState !== WS_READY_STATE_OPEN) {
      return
    }
    const response: Record<string, unknown> = {
      type: 'permission_response',
      request_id: requestId,
      allowed,
    }
    if (this.selectedDeviceId) {
      response.target_device_id = this.selectedDeviceId
    }
    this.ws.send(JSON.stringify(response))
  }

  private handleBridgeToolResult(message: Record<string, unknown>): void {
    const requestId = getStringField(message, ['tool_use_id', 'toolUseId'])
    if (!requestId) {
      return
    }
    const pending = this.pendingCalls.get(requestId)
    if (!pending) {
      return
    }

    const normalized =
      normalizeBridgeToolResult(message) ??
      makeTextToolResult(JSON.stringify(message), {
        isError: Boolean(message.is_error),
      })

    if (pending.isTabsContext && !this.selectedDeviceId) {
      pending.results.push(normalized)
      return
    }

    clearTimeout(pending.timeoutId)
    this.pendingCalls.delete(requestId)
    const durationMs = Date.now() - pending.startedAt
    if (extractTextFromToolResult(normalized).some(isAuthFailureText)) {
      this.context.onAuthenticationError?.()
    }
    if (normalized.isError) {
      this.context.trackEvent?.('chrome_bridge_tool_call_error', {
        status: 'bridge',
        tool_name: pending.toolName,
        error_type: 'tool_call_failed',
        duration_ms: durationMs,
      })
    } else {
      this.context.trackEvent?.('chrome_bridge_tool_call_completed', {
        status: 'bridge',
        tool_name: pending.toolName,
        duration_ms: durationMs,
      })
    }
    pending.resolve(normalized)
  }

  private handleBridgeError(error: unknown): void {
    const normalizedError =
      error instanceof Error ? error : new Error(String(error))
    if (this.pendingConnect) {
      this.connected = false
      this.authenticated = false
      this.context.trackEvent?.('chrome_bridge_connection_failed', {
        status: 'bridge',
        duration_ms:
          this.connectionStartTime === null
            ? undefined
            : Date.now() - this.connectionStartTime,
        error_type: 'websocket_error',
        reconnect_attempt: this.reconnectAttempts,
      })
      this.finishPendingConnect(
        new ChromeBridgeUnavailableError(normalizedError.message),
      )
      return
    }
    this.context.logger.debug(
      '[claude-for-chrome-mcp replacement] bridge websocket error: %s',
      normalizedError.message,
    )
  }

  private handleBridgeClose(code: number): void {
    const durationSinceConnectMs =
      this.connectionEstablishedTime === null
        ? 0
        : Date.now() - this.connectionEstablishedTime
    this.connected = false
    this.authenticated = false
    this.discoveryComplete = false
    this.pendingPairingRequestId = undefined
    this.pairingInProgress = false
    if (this.pendingSwitchResolve) {
      this.pendingSwitchResolve(null)
      this.pendingSwitchResolve = null
    }
    if (this.pendingDiscovery) {
      clearTimeout(this.pendingDiscovery.timeoutId)
      const { resolve } = this.pendingDiscovery
      this.pendingDiscovery = null
      resolve([])
    }
    if (this.pendingConnect) {
      this.finishPendingConnect(
        new ChromeBridgeUnavailableError(
          `Chrome bridge closed before pairing (code ${code})`,
        ),
      )
    }
    if (this.peerConnectedWaiters.length > 0) {
      const waiters = this.peerConnectedWaiters
      this.peerConnectedWaiters = []
      for (const waiter of waiters) {
        waiter(false)
      }
    }
    this.context.trackEvent?.('chrome_bridge_disconnected', {
      status: 'bridge',
      close_code: code,
      duration_since_connect_ms: durationSinceConnectMs,
      reconnect_attempt: this.reconnectAttempts + 1,
    })
    this.failPendingCalls(
      new Error(`[${this.context.serverName}] Bridge disconnected (code ${code})`),
    )
    this.closeBridgeSocket()
    this.scheduleReconnect()
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return
    }
    this.reconnectAttempts += 1
    if (this.reconnectAttempts > BRIDGE_MAX_RECONNECT_ATTEMPTS) {
      this.context.logger.info(
        '[claude-for-chrome-mcp replacement] giving up after %d bridge reconnect attempts; will retry on next tool call',
        BRIDGE_MAX_RECONNECT_ATTEMPTS,
      )
      this.reconnectAttempts = 0
      return
    }
    const delayMs = Math.min(
      BRIDGE_RECONNECT_DELAY_MS *
        Math.pow(1.5, this.reconnectAttempts - 1),
      30_000,
    )
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.ensureConnected().catch(error => {
        this.context.logger.debug(
          '[claude-for-chrome-mcp replacement] scheduled bridge reconnect failed: %s',
          error instanceof Error ? error.message : String(error),
        )
      })
    }, delayMs)
    this.reconnectTimer.unref?.()
  }

  private finishPendingConnect(error?: Error): void {
    const pending = this.pendingConnect
    if (!pending) {
      return
    }
    clearTimeout(pending.timeoutId)
    this.pendingConnect = null
    if (error) {
      pending.reject(error)
      return
    }
    pending.resolve()
  }

  private failPendingCalls(error: Error): void {
    for (const [requestId, pending] of this.pendingCalls) {
      clearTimeout(pending.timeoutId)
      pending.reject(error)
      this.pendingCalls.delete(requestId)
    }
  }

  private closeBridgeSocket(): void {
    const ws = this.ws
    this.ws = null
    if (!ws) {
      return
    }
    if (this.pendingSwitchResolve) {
      this.pendingSwitchResolve(null)
      this.pendingSwitchResolve = null
    }
    ws.removeAllListeners()
    try {
      ws.close()
    } catch {
      // Ignore close failures during teardown.
    }
  }
}

class ChromeNativeSocketProxy {
  private session: ChromeProxySession | null = null
  private connectPromise: Promise<ChromeProxySession> | null = null
  private cachedDynamicTools: Tool[] | null = null
  private permissionMode: PermissionMode = 'ask'
  private allowedDomains: string[] | undefined

  constructor(
    private readonly context: ClaudeForChromeContext,
    private readonly forwardNotification?: NotificationForwarder,
  ) {}

  async listTools(): Promise<Tool[]> {
    const session = await this.getOrConnectSession()
    try {
      const result = await session.client.listTools(undefined, {
        timeout: TOOL_CALL_TIMEOUT_MS,
      })
      const tools = normalizeTools(result.tools)
      const visibleTools = filterVisibleToolsForContext(tools, this.context)
      if (visibleTools.length > 0) {
        this.cachedDynamicTools = visibleTools
        return visibleTools
      }
      return this.cachedDynamicTools ??
        filterVisibleToolsForContext([...FALLBACK_TOOL_RECORDS], this.context)
    } catch (error) {
      await this.resetSession()
      if (this.cachedDynamicTools) {
        return this.cachedDynamicTools
      }
      throw error
    }
  }

  async setPermissionMode(
    permissionMode: PermissionMode,
    allowedDomains?: string[],
  ): Promise<void> {
    this.permissionMode = permissionMode
    this.allowedDomains = allowedDomains
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    args = {
      ...args,
      permission_mode: this.permissionMode,
      ...(this.allowedDomains && this.allowedDomains.length > 0
        ? { allowed_domains: this.allowedDomains }
        : {}),
    }
    const session = await this.getOrConnectSession()
    this.context.trackEvent?.('chrome_bridge_tool_call_started', {
      status: 'native_socket',
      tool_name: toolName,
    })

    try {
      const result = await session.client.callTool(
        {
          name: toolName,
          arguments: args,
        },
        undefined,
        { timeout: TOOL_CALL_TIMEOUT_MS },
      )

      this.context.trackEvent?.('chrome_bridge_tool_call_completed', {
        status: 'native_socket',
        tool_name: toolName,
      })
      if (extractTextFromToolResult(result).some(isAuthFailureText)) {
        this.context.onAuthenticationError?.()
      }
      return toMcpToolResult(result) ?? result
    } catch (error) {
      const errorType = classifyToolCallError(error)
      if (errorType === 'timeout') {
        this.context.trackEvent?.('chrome_bridge_tool_call_timeout', {
          status: 'native_socket',
          tool_name: toolName,
        })
      }
      this.context.trackEvent?.('chrome_bridge_tool_call_error', {
        status: 'native_socket',
        tool_name: toolName,
        error_type: errorType,
      })
      if (error instanceof Error && isAuthFailureText(error.message)) {
        this.context.onAuthenticationError?.()
      }
      await this.resetSession()
      throw error
    }
  }

  private async getOrConnectSession(): Promise<ChromeProxySession> {
    if (this.session) {
      return this.session
    }
    if (this.connectPromise) {
      return this.connectPromise
    }
    this.connectPromise = this.connect()
    try {
      const session = await this.connectPromise
      this.session = session
      return session
    } finally {
      this.connectPromise = null
    }
  }

  private async connect(): Promise<ChromeProxySession> {
    const socketPaths = this.getCandidateSocketPaths()
    let lastError: unknown

    for (const socketPath of socketPaths) {
      const transport = new SocketMcpTransport(
        socketPath,
        this.context.logger,
        (method, params) => this.handleNotification(method, params),
      )
      const client = new Client(
        {
          name: 'ncode',
          title: 'NCode',
          version: '0.0.0-reconstructed',
        },
        {
          capabilities: {},
        },
      )

      try {
        await client.connect(transport)
        this.context.trackEvent?.('chrome_bridge_connection_succeeded', {
          status: 'native_socket',
        })
        this.context.logger.info(
          '[claude-for-chrome-mcp replacement] connected via native socket: %s',
          socketPath,
        )
        return { client, transport, socketPath }
      } catch (error) {
        lastError = error
        this.context.logger.debug(
          '[claude-for-chrome-mcp replacement] native socket connect failed for %s: %s',
          socketPath,
          error instanceof Error ? error.message : String(error),
        )
        await transport.close().catch(() => {})
      }
    }

    this.context.trackEvent?.('chrome_bridge_connection_failed', {
      status: 'native_socket',
      error_type: lastError instanceof Error ? 'connect_failed' : 'unknown',
    })
    throw lastError ?? new Error('No Chrome MCP socket available')
  }

  private getCandidateSocketPaths(): string[] {
    const paths = [
      this.context.socketPath,
      ...this.context.getSocketPaths(),
    ].filter(Boolean)
    return [...new Set(paths)]
  }

  private handleNotification(method: string, params: unknown): void {
    const normalizedMethod = method.toLowerCase()

    if (isToolListChangedMethod(normalizedMethod)) {
      this.cachedDynamicTools = null
    }

    if (normalizedMethod.includes('auth')) {
      this.context.onAuthenticationError?.()
    }

    if (normalizedMethod.includes('pair') && isRecord(params)) {
      const candidates: Record<string, unknown>[] = [params]
      if (isRecord(params.payload)) {
        candidates.push(params.payload)
      }
      if (isRecord(params.data)) {
        candidates.push(params.data)
      }

      for (const candidate of candidates) {
        const deviceId = getStringField(candidate, [
          'deviceId',
          'device_id',
          'pairedDeviceId',
          'paired_device_id',
        ])
        const name = getStringField(candidate, [
          'name',
          'deviceName',
          'device_name',
          'pairedDeviceName',
          'paired_device_name',
        ])
        if (deviceId && name) {
          this.context.onExtensionPaired?.(deviceId, name)
          break
        }
      }
    }

    if (isToolListChangedMethod(normalizedMethod) || normalizedMethod.startsWith('notifications/')) {
      this.forwardNotification?.(method, params)
    }
  }

  private async resetSession(): Promise<void> {
    const current = this.session
    this.session = null
    if (!current) {
      return
    }
    this.context.trackEvent?.('chrome_bridge_disconnected', {
      status: 'native_socket',
    })
    await Promise.allSettled([current.client.close(), current.transport.close()])
  }
}

class ChromeProxyRouter {
  private readonly nativeProxy: ChromeNativeSocketProxy
  private readonly bridgeProxy: ChromeBridgeProxy | null

  constructor(
    private readonly context: ClaudeForChromeContext,
    forwardNotification: NotificationForwarder,
  ) {
    this.nativeProxy = new ChromeNativeSocketProxy(context, forwardNotification)
    this.bridgeProxy = context.bridgeConfig
      ? new ChromeBridgeProxy(context, forwardNotification)
      : null
  }

  async listTools(): Promise<Tool[]> {
    let bridgeTools: Tool[] | null = null
    if (this.bridgeProxy) {
      try {
        bridgeTools = await this.bridgeProxy.listTools()
      } catch (error) {
        this.context.logger.debug(
          '[claude-for-chrome-mcp replacement] bridge listTools unavailable, trying native socket: %s',
          error instanceof Error ? error.message : String(error),
        )
      }
    }

    try {
      const nativeTools = await this.nativeProxy.listTools()
      if (bridgeTools && !hasFallbackToolNamesOnly(bridgeTools)) {
        return bridgeTools
      }
      if (bridgeTools && hasFallbackToolNamesOnly(bridgeTools)) {
        const nativeToolNames = new Set(nativeTools.map(tool => tool.name))
        const bridgeOnlyTools = bridgeTools.filter(tool =>
          BRIDGE_ONLY_TOOL_NAMES.has(tool.name),
        )
        if (bridgeOnlyTools.length > 0) {
          return [
            ...nativeTools,
            ...bridgeOnlyTools.filter(tool => !nativeToolNames.has(tool.name)),
          ]
        }
      }
      return nativeTools
    } catch (error) {
      if (bridgeTools) {
        this.context.logger.debug(
          '[claude-for-chrome-mcp replacement] native listTools unavailable, falling back to bridge metadata: %s',
          error instanceof Error ? error.message : String(error),
        )
        return bridgeTools
      }
      throw error
    }
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    if (toolName === 'switch_browser') {
      return await this.handleSwitchBrowser()
    }
    if (CONTROL_TOOL_NAMES.has(toolName)) {
      return await this.handleControlTool(toolName, args)
    }
    if (
      ANT_ONLY_LIGHTNING_TOOL_NAMES.has(toolName) &&
      !this.context.callAnthropicMessages
    ) {
      return makeTextToolResult(
        `${toolName} is only available in internal Chrome MCP builds.`,
        { isError: true },
      )
    }

    if (this.bridgeProxy) {
      try {
        return await this.bridgeProxy.callTool(toolName, args)
      } catch (error) {
        if (!(error instanceof ChromeBridgeUnavailableError)) {
          throw error
        }
        this.context.logger.debug(
          '[claude-for-chrome-mcp replacement] bridge unavailable for %s, falling back to native socket: %s',
          toolName,
          error.message,
        )
      }
    }

    return await this.nativeProxy.callTool(toolName, args)
  }

  private async handleControlTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    switch (toolName) {
      case 'set_permission_mode': {
        const mode = parsePermissionMode(args) ?? 'ask'
        const allowedDomains = parseAllowedDomains(args)
        await this.nativeProxy.setPermissionMode(mode, allowedDomains)
        await this.bridgeProxy?.setPermissionMode(mode, allowedDomains)
        return makeTextToolResult(`Permission mode set to: ${mode}`)
      }
      default:
        return makeTextToolResult(`Unsupported Chrome control tool: ${toolName}`, {
          isError: true,
        })
    }
  }

  private async handleSwitchBrowser(): Promise<unknown> {
    if (!this.context.bridgeConfig || !this.bridgeProxy) {
      return makeTextToolResult(
        'Browser switching is only available with bridge connections.',
        { isError: true },
      )
    }
    let switched: SwitchBrowserSelection | 'no_other_browsers' | null
    try {
      switched = await this.bridgeProxy.switchBrowser()
    } catch (error) {
      if (error instanceof ChromeBridgeUnavailableError) {
        return makeTextToolResult(unavailableMessage(this.context, 'switch_browser'), {
          isError: true,
        })
      }
      throw error
    }
    if (switched === 'no_other_browsers') {
      return makeTextToolResult(
        'No other browsers available to switch to. Open Chrome with the NCode extension in another browser to switch.',
        { isError: true },
      )
    }
    if (switched) {
      return makeTextToolResult(`Connected to browser "${switched.name}".`)
    }
    return makeTextToolResult(
      'No browser responded within the timeout. Make sure Chrome is open with the NCode extension installed, then try again.',
      { isError: true },
    )
  }
}

function normalizeBridgeExtensions(raw: unknown): BridgeExtension[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const extensions: BridgeExtension[] = []
  for (const item of raw) {
    if (!isRecord(item)) {
      continue
    }
    const deviceId = getStringField(item, ['deviceId', 'device_id'])
    if (!deviceId) {
      continue
    }
    extensions.push({
      deviceId,
      name: getStringField(item, ['name', 'deviceName', 'device_name']),
      connectedAt:
        typeof item.connectedAt === 'number'
          ? item.connectedAt
          : typeof item.connected_at === 'number'
            ? item.connected_at
            : undefined,
      osPlatform: getStringField(item, ['osPlatform', 'os_platform']),
    })
  }
  return extensions
}

function normalizeBridgeToolResult(message: Record<string, unknown>):
  | {
      content: unknown[]
      isError?: boolean
      structuredContent?: unknown
    }
  | null {
  const normalized = toMcpToolResult(message)
  if (normalized) {
    return normalized
  }
  if (Array.isArray(message.content)) {
    return {
      content: message.content.map(normalizeToolResultContentItem),
      ...(
        message.is_error === true ||
        message.isError === true ||
        isRecord(message.error)
          ? { isError: true }
          : {}
      ),
    }
  }
  return null
}

function mergeTabsContextResults(
  results: Array<{
    content: unknown[]
    isError?: boolean
    structuredContent?: unknown
  }>,
): {
  content: unknown[]
  isError?: boolean
  structuredContent?: unknown
} {
  const mergedTabs: Array<{ tabId?: unknown; title?: unknown; url?: unknown }> = []

  for (const result of results) {
    for (const item of result.content) {
      if (!isRecord(item) || item.type !== 'text' || typeof item.text !== 'string') {
        continue
      }
      try {
        const parsed = JSON.parse(item.text)
        if (Array.isArray(parsed)) {
          for (const tab of parsed) {
            if (isRecord(tab)) {
              mergedTabs.push({
                tabId: tab.tabId,
                title: tab.title,
                url: tab.url,
              })
            }
          }
        } else if (isRecord(parsed) && Array.isArray(parsed.availableTabs)) {
          for (const tab of parsed.availableTabs) {
            if (isRecord(tab)) {
              mergedTabs.push({
                tabId: tab.tabId,
                title: tab.title,
                url: tab.url,
              })
            }
          }
        }
      } catch {
        // Keep trying other results; some bridge payloads are plain text.
      }
    }
  }

  if (mergedTabs.length === 0) {
    return results[0] ?? makeTextToolResult('No browser tabs found.')
  }

  const lines = mergedTabs.map(tab => {
    const tabId =
      typeof tab.tabId === 'number' || typeof tab.tabId === 'string'
        ? String(tab.tabId)
        : '?'
    const title = typeof tab.title === 'string' ? tab.title : 'Untitled tab'
    const url = typeof tab.url === 'string' ? tab.url : 'unknown url'
    return `  • tabId ${tabId}: "${title}" (${url})`
  })

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ availableTabs: mergedTabs }),
      },
      {
        type: 'text',
        text: ['Tab Context:', '- Available tabs:', ...lines].join('\n'),
      },
    ],
  }
}

export function createClaudeForChromeMcpServer(
  context: ClaudeForChromeContext,
): Server {
  const server = new Server(
    {
      name: 'claude-in-chrome',
      version: '0.0.0-reconstructed',
    },
    {
      capabilities: {
        tools: {},
        logging: {},
      },
    },
  )

  const forwardNotification: NotificationForwarder = (method, params) => {
    if (isToolListChangedMethod(method)) {
      void server.sendToolListChanged().catch(error => {
        context.logger.debug(
          '[claude-for-chrome-mcp replacement] failed to forward tool list change: %s',
          error instanceof Error ? error.message : String(error),
        )
      })
      return
    }
    void server.notification({ method, params }).catch(error => {
      context.logger.debug(
        '[claude-for-chrome-mcp replacement] failed to forward notification %s: %s',
        method,
        error instanceof Error ? error.message : String(error),
      )
    })
  }

  const proxy = new ChromeProxyRouter(context, forwardNotification)

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    try {
      return { tools: await proxy.listTools() }
    } catch (error) {
      context.logger.warn(
        '[claude-for-chrome-mcp replacement] listTools failed, using fallback definitions: %s',
        error instanceof Error ? error.message : String(error),
      )
    }
    return {
      tools: filterVisibleToolsForContext([...FALLBACK_TOOL_RECORDS], context),
    }
  })

  server.setRequestHandler(CallToolRequestSchema, async request => {
    const toolName = request.params.name
    const args = isRecord(request.params.arguments)
      ? request.params.arguments
      : {}

    try {
      const result = await proxy.callTool(toolName, args)
      const normalized = toMcpToolResult(result)
      if (normalized) {
        return normalized
      }
      return makeTextToolResult(JSON.stringify(result))
    } catch (error) {
      context.trackEvent?.('claude_in_chrome_unavailable', {
        tool_name: toolName,
      })
      context.logger.warn(
        '[claude-for-chrome-mcp replacement] %s failed: %s',
        toolName,
        error instanceof Error ? error.message : String(error),
      )

      return makeTextToolResult(unavailableMessage(context, toolName), {
        isError: true,
      })
    }
  })

  return server
}
