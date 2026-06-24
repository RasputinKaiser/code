import { describe, expect, test } from 'bun:test'

import { resolveEffectivePromptInputActivity } from './replPromptInputActivityState.js'

describe('resolveEffectivePromptInputActivity', () => {
  test('returns false when there is no suppressible dialog even if draft is non-empty', () => {
    expect(
      resolveEffectivePromptInputActivity({
        isPromptInputActive: true,
        currentDraft: 'hello',
        sandboxPermissionRequest: null,
        toolUseConfirmRequest: null,
        promptRequest: null,
        workerSandboxPermissionRequest: null,
        elicitationRequest: null,
        showingCostDialog: false,
      }),
    ).toBe(false)
  })

  test('treats a non-empty draft as active when a suppressible dialog is present', () => {
    expect(
      resolveEffectivePromptInputActivity({
        isPromptInputActive: false,
        currentDraft: 'hello',
        sandboxPermissionRequest: { id: 'sandbox' },
        toolUseConfirmRequest: null,
        promptRequest: null,
        workerSandboxPermissionRequest: null,
        elicitationRequest: null,
        showingCostDialog: false,
      }),
    ).toBe(true)
  })

  test('preserves explicit prompt activity when dialogs are present', () => {
    expect(
      resolveEffectivePromptInputActivity({
        isPromptInputActive: true,
        currentDraft: '',
        sandboxPermissionRequest: null,
        toolUseConfirmRequest: { id: 'tool' },
        promptRequest: null,
        workerSandboxPermissionRequest: null,
        elicitationRequest: null,
        showingCostDialog: false,
      }),
    ).toBe(true)
  })
})
