import { describe, expect, test } from 'bun:test'

import { shouldTrackPromptInputActivity } from './replPromptInputActivityGate.js'

describe('shouldTrackPromptInputActivity', () => {
  test('returns false when no suppressible dialog is present', () => {
    expect(
      shouldTrackPromptInputActivity({
        sandboxPermissionRequest: null,
        toolUseConfirmRequest: null,
        promptRequest: null,
        workerSandboxPermissionRequest: null,
        elicitationRequest: null,
        showingCostDialog: false,
      }),
    ).toBe(false)
  })

  test('returns true when any suppressible request or cost dialog is present', () => {
    expect(
      shouldTrackPromptInputActivity({
        sandboxPermissionRequest: { id: 'sandbox' },
        toolUseConfirmRequest: null,
        promptRequest: null,
        workerSandboxPermissionRequest: null,
        elicitationRequest: null,
        showingCostDialog: false,
      }),
    ).toBe(true)

    expect(
      shouldTrackPromptInputActivity({
        sandboxPermissionRequest: null,
        toolUseConfirmRequest: null,
        promptRequest: null,
        workerSandboxPermissionRequest: null,
        elicitationRequest: null,
        showingCostDialog: true,
      }),
    ).toBe(true)
  })
})
