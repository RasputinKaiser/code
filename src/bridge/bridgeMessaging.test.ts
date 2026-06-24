import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import {
  _resetForTesting,
  attachAnalyticsSink,
} from '../services/analytics/index.js'
import {
  BoundedUUIDSet,
  handleIngressMessage,
  handleServerControlRequest,
} from './bridgeMessaging.js'

const analyticsEvents: Array<{
  eventName: string
  metadata: Record<string, boolean | number | undefined>
}> = []

beforeEach(() => {
  analyticsEvents.length = 0
  _resetForTesting()
  attachAnalyticsSink({
    logEvent(eventName, metadata) {
      analyticsEvents.push({ eventName, metadata })
    },
    async logEventAsync(eventName, metadata) {
      analyticsEvents.push({ eventName, metadata })
    },
  })
})

afterEach(() => {
  _resetForTesting()
})

function createWriteOnlyTransport() {
  const writes: unknown[] = []

  return {
    writes,
    transport: {
      write: async (message: unknown) => {
        writes.push(message)
      },
    } as never,
  }
}

describe('handleIngressMessage', () => {
  it('routes control responses and compat-normalized control requests before SDK message handling', () => {
    const permissionResponses: unknown[] = []
    const controlRequests: unknown[] = []
    const inboundMessages: unknown[] = []
    const recentPostedUUIDs = new BoundedUUIDSet(8)
    const recentInboundUUIDs = new BoundedUUIDSet(8)

    handleIngressMessage(
      JSON.stringify({
        type: 'control_response',
        response: {
          subtype: 'success',
          requestId: 'response-1',
        },
      }),
      recentPostedUUIDs,
      recentInboundUUIDs,
      msg => {
        inboundMessages.push(msg)
      },
      response => {
        permissionResponses.push(response)
      },
      request => {
        controlRequests.push(request)
      },
    )

    handleIngressMessage(
      JSON.stringify({
        type: 'control_request',
        requestId: 'request-1',
        request: {
          subtype: 'set_model',
          model: 'claude-test-model',
        },
      }),
      recentPostedUUIDs,
      recentInboundUUIDs,
      msg => {
        inboundMessages.push(msg)
      },
      response => {
        permissionResponses.push(response)
      },
      request => {
        controlRequests.push(request)
      },
    )

    expect(permissionResponses).toHaveLength(1)
    expect(permissionResponses[0]).toMatchObject({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: 'response-1',
      },
    })
    expect(
      Object.hasOwn(
        (permissionResponses[0] as { response: Record<string, unknown> })
          .response,
        'requestId',
      ),
    ).toBe(false)

    expect(controlRequests).toHaveLength(1)
    expect(controlRequests[0]).toMatchObject({
      type: 'control_request',
      request_id: 'request-1',
      request: {
        subtype: 'set_model',
        model: 'claude-test-model',
      },
    })
    expect(
      Object.hasOwn(controlRequests[0] as Record<string, unknown>, 'requestId'),
    ).toBe(false)

    expect(inboundMessages).toEqual([])
    expect(analyticsEvents).toEqual([])
  })

  it('deduplicates echoed and replayed inbound user messages while forwarding fresh prompts', () => {
    const forwarded: unknown[] = []
    const recentPostedUUIDs = new BoundedUUIDSet(8)
    const recentInboundUUIDs = new BoundedUUIDSet(8)
    recentPostedUUIDs.add('echo-uuid')

    handleIngressMessage(
      JSON.stringify({
        type: 'user',
        uuid: 'echo-uuid',
        message: {
          role: 'user',
          content: 'echoed prompt',
        },
      }),
      recentPostedUUIDs,
      recentInboundUUIDs,
      msg => {
        forwarded.push(msg)
      },
    )

    handleIngressMessage(
      JSON.stringify({
        type: 'assistant',
        uuid: 'assistant-uuid',
        message: {
          role: 'assistant',
          content: 'assistant reply',
        },
      }),
      recentPostedUUIDs,
      recentInboundUUIDs,
      msg => {
        forwarded.push(msg)
      },
    )

    handleIngressMessage(
      JSON.stringify({
        type: 'user',
        uuid: 'fresh-uuid',
        message: {
          role: 'user',
          content: 'fresh prompt',
        },
      }),
      recentPostedUUIDs,
      recentInboundUUIDs,
      msg => {
        forwarded.push(msg)
      },
    )

    handleIngressMessage(
      JSON.stringify({
        type: 'user',
        uuid: 'fresh-uuid',
        message: {
          role: 'user',
          content: 'fresh prompt',
        },
      }),
      recentPostedUUIDs,
      recentInboundUUIDs,
      msg => {
        forwarded.push(msg)
      },
    )

    expect(forwarded).toHaveLength(1)
    expect(forwarded[0]).toMatchObject({
      type: 'user',
      uuid: 'fresh-uuid',
      message: {
        role: 'user',
        content: 'fresh prompt',
      },
    })
    expect(recentInboundUUIDs.has('fresh-uuid')).toBe(true)
    expect(analyticsEvents).toEqual([
      {
        eventName: 'ncode_bridge_message_received',
        metadata: { is_repl: true },
      },
    ])
  })
})

describe('handleServerControlRequest', () => {
  it('allows initialize but rejects mutable requests in outbound-only mode', () => {
    const { writes, transport } = createWriteOnlyTransport()
    const setModelCalls: Array<string | undefined> = []

    handleServerControlRequest(
      {
        type: 'control_request',
        request_id: 'initialize-1',
        request: {
          subtype: 'initialize',
        },
      } as never,
      {
        transport,
        sessionId: 'session-123',
        outboundOnly: true,
        onSetModel: model => {
          setModelCalls.push(model)
        },
      },
    )

    handleServerControlRequest(
      {
        type: 'control_request',
        request_id: 'set-model-1',
        request: {
          subtype: 'set_model',
          model: 'claude-bridge-model',
        },
      } as never,
      {
        transport,
        sessionId: 'session-123',
        outboundOnly: true,
        onSetModel: model => {
          setModelCalls.push(model)
        },
      },
    )

    expect(writes).toHaveLength(2)
    expect(writes[0]).toMatchObject({
      type: 'control_response',
      session_id: 'session-123',
      response: {
        subtype: 'success',
        request_id: 'initialize-1',
      },
    })
    expect(writes[0]).toMatchObject({
      response: {
        response: {
          pid: expect.any(Number),
        },
      },
    })
    expect(writes[1]).toMatchObject({
      type: 'control_response',
      session_id: 'session-123',
      response: {
        subtype: 'error',
        request_id: 'set-model-1',
        error: expect.stringContaining('outbound-only'),
      },
    })
    expect(setModelCalls).toEqual([])
  })

  it('returns an explicit error when set_permission_mode has no registered callback', () => {
    const { writes, transport } = createWriteOnlyTransport()

    handleServerControlRequest(
      {
        type: 'control_request',
        request_id: 'permission-1',
        request: {
          subtype: 'set_permission_mode',
          mode: 'default',
        },
      } as never,
      {
        transport,
        sessionId: 'session-456',
      },
    )

    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({
      type: 'control_response',
      session_id: 'session-456',
      response: {
        subtype: 'error',
        request_id: 'permission-1',
        error: expect.stringContaining('callback not registered'),
      },
    })
  })
})
