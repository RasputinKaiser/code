import { describe, expect, it } from 'bun:test'
import { toFirstPartyInternalEventData } from './firstPartyEventLoggingExporter.js'

describe('toFirstPartyInternalEventData', () => {
  it('serializes to the 1P API shape without injecting proto defaults', () => {
    const clientTimestamp = new Date('2026-01-02T03:04:05.000Z')
    const event = toFirstPartyInternalEventData({
      event_name: 'ncode_test_event',
      client_timestamp: clientTimestamp,
      env: {
        platform: 'linux',
        remote_environment_type: undefined,
      },
      auth: {
        organization_uuid: 'org-123',
        account_uuid: undefined,
      },
      user_type: undefined,
    })

    expect(JSON.parse(JSON.stringify(event))).toEqual({
      event_name: 'ncode_test_event',
      client_timestamp: '2026-01-02T03:04:05.000Z',
      env: {
        platform: 'linux',
      },
      auth: {
        organization_uuid: 'org-123',
      },
    })
  })
})
