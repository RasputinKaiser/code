import { describe, expect, test } from 'bun:test'

import {
  resolveReplFocusedInputDialog,
  resolveReplHasSuppressedDialogs,
  type ReplFocusedInputDialog,
} from './replFocusedInputDialog.js'

function baseState(): Parameters<typeof resolveReplFocusedInputDialog>[0] {
  return {
    isExiting: false,
    exitFlow: null,
    isMessageSelectorVisible: false,
    isPromptInputActive: false,
    sandboxPermissionRequest: null,
    toolJSX: null,
    toolJSXShouldContinueAnimation: undefined,
    toolUseConfirmRequest: null,
    promptRequest: null,
    workerSandboxPermissionRequest: null,
    elicitationRequest: null,
    showingCostDialog: false,
    idleReturnPending: null,
    ultraplanEnabled: false,
    isLoading: true,
    ultraplanPendingChoice: null,
    ultraplanLaunchPending: null,
    showIdeOnboarding: false,
    isAntUser: false,
    showModelSwitchCallout: false,
    showUndercoverCallout: false,
    showEffortCallout: false,
    showRemoteCallout: false,
    lspRecommendation: null,
    hintRecommendation: null,
    showDesktopUpsellStartup: false,
  }
}

describe('resolveReplFocusedInputDialog', () => {
  test('preserves exit and message-selector precedence', () => {
    const withExit = resolveReplFocusedInputDialog({
      ...baseState(),
      isExiting: true,
      isMessageSelectorVisible: true,
      sandboxPermissionRequest: {},
    })
    expect(withExit).toBeUndefined()

    const withSelector = resolveReplFocusedInputDialog({
      ...baseState(),
      isPromptInputActive: true,
      isMessageSelectorVisible: true,
      sandboxPermissionRequest: {},
    })
    expect(withSelector).toBe('message-selector')
  })

  test('suppresses interrupts while user is typing', () => {
    const result = resolveReplFocusedInputDialog({
      ...baseState(),
      isPromptInputActive: true,
      sandboxPermissionRequest: {},
      toolUseConfirmRequest: {},
      promptRequest: {},
      workerSandboxPermissionRequest: {},
    })
    expect(result).toBeUndefined()
  })

  test('preserves permission queue precedence and animation gate', () => {
    const priorityState = {
      ...baseState(),
      sandboxPermissionRequest: { id: 'sandbox' },
      toolUseConfirmRequest: { id: 'tool' },
      promptRequest: { id: 'prompt' },
      workerSandboxPermissionRequest: { id: 'worker' },
      elicitationRequest: { id: 'elicitation' },
      showingCostDialog: true,
    }
    expect(resolveReplFocusedInputDialog(priorityState)).toBe(
      'sandbox-permission',
    )

    const blockedByToolJsx = resolveReplFocusedInputDialog({
      ...baseState(),
      toolJSX: { open: true },
      toolJSXShouldContinueAnimation: false,
      toolUseConfirmRequest: { id: 'tool' },
      promptRequest: { id: 'prompt' },
    })
    expect(blockedByToolJsx).toBeUndefined()

    const toolPermission = resolveReplFocusedInputDialog({
      ...baseState(),
      toolJSX: { open: true },
      toolJSXShouldContinueAnimation: true,
      toolUseConfirmRequest: { id: 'tool' },
      promptRequest: { id: 'prompt' },
    })
    expect(toolPermission).toBe('tool-permission')
  })

  test('preserves ultraplan gating by feature flag and loading state', () => {
    const blockedWhileLoading = resolveReplFocusedInputDialog({
      ...baseState(),
      ultraplanEnabled: true,
      isLoading: true,
      toolJSX: { open: true },
      toolJSXShouldContinueAnimation: true,
      ultraplanPendingChoice: { id: 'choice' },
    })
    expect(blockedWhileLoading).toBeUndefined()

    const choice = resolveReplFocusedInputDialog({
      ...baseState(),
      ultraplanEnabled: true,
      isLoading: false,
      toolJSX: { open: true },
      toolJSXShouldContinueAnimation: true,
      ultraplanPendingChoice: { id: 'choice' },
      ultraplanLaunchPending: { id: 'launch' },
    })
    expect(choice).toBe('ultraplan-choice')

    const launch = resolveReplFocusedInputDialog({
      ...baseState(),
      ultraplanEnabled: true,
      isLoading: false,
      toolJSX: { open: true },
      toolJSXShouldContinueAnimation: true,
      ultraplanLaunchPending: { id: 'launch' },
    })
    expect(launch).toBe('ultraplan-launch')
  })

  test('preserves onboarding and callout ordering', () => {
    const result = resolveReplFocusedInputDialog({
      ...baseState(),
      toolJSX: { open: true },
      toolJSXShouldContinueAnimation: true,
      showIdeOnboarding: true,
      isAntUser: true,
      showModelSwitchCallout: true,
      showUndercoverCallout: true,
      showEffortCallout: true,
      showRemoteCallout: true,
      lspRecommendation: {},
      hintRecommendation: {},
      showDesktopUpsellStartup: true,
    })
    expect(result).toBe('ide-onboarding')

    const antOnly: ReplFocusedInputDialog | undefined = resolveReplFocusedInputDialog(
      {
        ...baseState(),
        toolJSX: { open: true },
        toolJSXShouldContinueAnimation: true,
        isAntUser: true,
        showModelSwitchCallout: true,
        showUndercoverCallout: true,
      },
    )
    expect(antOnly).toBe('model-switch')

    const nonAnt = resolveReplFocusedInputDialog({
      ...baseState(),
      toolJSX: { open: true },
      toolJSXShouldContinueAnimation: true,
      isAntUser: false,
      showModelSwitchCallout: true,
      showEffortCallout: true,
    })
    expect(nonAnt).toBe('effort-callout')
  })
})

describe('resolveReplHasSuppressedDialogs', () => {
  test('returns false when prompt input is inactive', () => {
    const result = resolveReplHasSuppressedDialogs({
      isPromptInputActive: false,
      sandboxPermissionRequest: { id: 'sandbox' },
      toolUseConfirmRequest: { id: 'tool' },
      promptRequest: { id: 'prompt' },
      workerSandboxPermissionRequest: { id: 'worker' },
      elicitationRequest: { id: 'elicitation' },
      showingCostDialog: true,
    })
    expect(result).toBe(false)
  })

  test('preserves original truthy-value semantics for active prompt input', () => {
    const toolRequest = { id: 'tool' }
    const result = resolveReplHasSuppressedDialogs({
      isPromptInputActive: true,
      sandboxPermissionRequest: null,
      toolUseConfirmRequest: toolRequest,
      promptRequest: { id: 'prompt' },
      workerSandboxPermissionRequest: null,
      elicitationRequest: null,
      showingCostDialog: true,
    })
    expect(result).toBe(toolRequest)

    const costOnly = resolveReplHasSuppressedDialogs({
      isPromptInputActive: true,
      sandboxPermissionRequest: null,
      toolUseConfirmRequest: null,
      promptRequest: null,
      workerSandboxPermissionRequest: null,
      elicitationRequest: null,
      showingCostDialog: true,
    })
    expect(costOnly).toBe(true)
  })
})
