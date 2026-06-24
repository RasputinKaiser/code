import axios from 'axios'
import { z } from 'zod/v4'
import { resolveManagedRemoteCapability } from '../../auth/capabilities/remote.js'
import { getAuthRuntime } from '../../auth/runtime/AuthRuntime.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import { isPolicyAllowed } from '../../services/policyLimits/index.js'
import type { ToolUseContext } from '../../Tool.js'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { buildNoumenaPlatformUrl } from '../../utils/platformUrls.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import { DESCRIPTION, PROMPT, REMOTE_TRIGGER_TOOL_NAME } from './prompt.js'
import { renderToolResultMessage, renderToolUseMessage } from './UI.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    action: z.enum(['list', 'get', 'create', 'update', 'run']),
    trigger_id: z
      .string()
      .regex(/^[\w-]+$/)
      .optional()
      .describe('Required for get, update, and run'),
    body: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('JSON body for create and update'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>
export type Input = z.infer<InputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    status: z.number(),
    json: z.string(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>
export type Output = z.infer<OutputSchema>

const TRIGGERS_BETA = 'ccr-triggers-2026-01-30'

export const RemoteTriggerTool = buildTool({
  name: REMOTE_TRIGGER_TOOL_NAME,
  searchHint: 'manage scheduled remote agent triggers',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  isEnabled() {
    return (
      getFeatureValue_CACHED_MAY_BE_STALE('ncode_surreal_dali', false) &&
      isPolicyAllowed('allow_remote_sessions')
    )
  },
  isConcurrencySafe() {
    return true
  },
  isReadOnly(input: Input) {
    return input.action === 'list' || input.action === 'get'
  },
  toAutoClassifierInput(input: Input) {
    return `RemoteTrigger ${input.action}${input.trigger_id ? ` ${input.trigger_id}` : ''}`
  },
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return PROMPT
  },
  async call(input: Input, context: ToolUseContext) {
    const session = getAuthRuntime().getCurrentSession()
    if (session.principalSource === 'console_api_key') {
      throw new Error(
        'Authenticated with a console API key, but scheduled remote agents require a managed Noumena account login. Run /login, choose the managed account option, and try again.',
      )
    }

    const { accessToken, orgUUID } = await resolveManagedRemoteCapability()

    const base = buildNoumenaPlatformUrl('/v1/code/triggers')
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'anthropic-beta': TRIGGERS_BETA,
      'x-organization-uuid': orgUUID,
    }

    const { action, trigger_id, body } = input
    let method: 'GET' | 'POST'
    let url: string
    let data: unknown
    switch (action) {
      case 'list':
        method = 'GET'
        url = base
        break
      case 'get':
        if (!trigger_id) throw new Error('get requires trigger_id')
        method = 'GET'
        url = `${base}/${trigger_id}`
        break
      case 'create':
        if (!body) throw new Error('create requires body')
        method = 'POST'
        url = base
        data = body
        break
      case 'update':
        if (!trigger_id) throw new Error('update requires trigger_id')
        if (!body) throw new Error('update requires body')
        method = 'POST'
        url = `${base}/${trigger_id}`
        data = body
        break
      case 'run':
        if (!trigger_id) throw new Error('run requires trigger_id')
        method = 'POST'
        url = `${base}/${trigger_id}/run`
        data = {}
        break
    }

    const res = await axios.request({
      method,
      url,
      headers,
      data,
      timeout: 20_000,
      signal: context.abortController.signal,
      validateStatus: () => true,
    })

    return {
      data: {
        status: res.status,
        json: jsonStringify(res.data),
      },
    }
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: `HTTP ${output.status}\n${output.json}`,
    }
  },
  renderToolUseMessage,
  renderToolResultMessage,
} satisfies ToolDef<InputSchema, Output>)
