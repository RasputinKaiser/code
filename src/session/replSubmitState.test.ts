import { describe, expect, it } from 'bun:test'
import { resolveReplSubmitState } from './replSubmitState.js'

describe('resolveReplSubmitState', () => {
  it('treats a normal prompt submit as immediate and clears prompt state', () => {
    expect(
      resolveReplSubmitState({
        input: 'hello world',
        inputMode: 'prompt',
        isLoading: false,
        isRemoteMode: false,
        hasSpeculationAccept: false,
        fromKeybinding: false,
        hasStashedPrompt: false,
      }),
    ).toEqual({
      isSlashCommand: false,
      submitsNow: true,
      shouldAddToHistory: true,
      shouldRestoreStashImmediately: false,
      shouldProvideDeferredStashRestore: false,
      shouldClearInputValue: true,
      shouldClearPastedContents: true,
      shouldResetInputMode: true,
      shouldIncrementSubmitCount: true,
      shouldClearBuffer: true,
      shouldShowProcessingPlaceholder: true,
    })
  })

  it('preserves the stashed prompt during a queued slash-command submit', () => {
    expect(
      resolveReplSubmitState({
        input: '/model',
        inputMode: 'prompt',
        isLoading: true,
        isRemoteMode: false,
        hasSpeculationAccept: false,
        fromKeybinding: false,
        hasStashedPrompt: true,
      }),
    ).toEqual({
      isSlashCommand: true,
      submitsNow: false,
      shouldAddToHistory: true,
      shouldRestoreStashImmediately: false,
      shouldProvideDeferredStashRestore: true,
      shouldClearInputValue: false,
      shouldClearPastedContents: false,
      shouldResetInputMode: false,
      shouldIncrementSubmitCount: false,
      shouldClearBuffer: false,
      shouldShowProcessingPlaceholder: false,
    })
  })

  it('restores the stashed prompt immediately for remote non-slash submits', () => {
    expect(
      resolveReplSubmitState({
        input: 'remote prompt',
        inputMode: 'prompt',
        isLoading: true,
        isRemoteMode: true,
        hasSpeculationAccept: false,
        fromKeybinding: false,
        hasStashedPrompt: true,
      }),
    ).toEqual({
      isSlashCommand: false,
      submitsNow: true,
      shouldAddToHistory: true,
      shouldRestoreStashImmediately: true,
      shouldProvideDeferredStashRestore: true,
      shouldClearInputValue: false,
      shouldClearPastedContents: false,
      shouldResetInputMode: true,
      shouldIncrementSubmitCount: true,
      shouldClearBuffer: true,
      shouldShowProcessingPlaceholder: false,
    })
  })

  it('does not add keybinding submits to history or clear the typed prompt', () => {
    expect(
      resolveReplSubmitState({
        input: '/help',
        inputMode: 'prompt',
        isLoading: false,
        isRemoteMode: false,
        hasSpeculationAccept: false,
        fromKeybinding: true,
        hasStashedPrompt: false,
      }),
    ).toEqual({
      isSlashCommand: true,
      submitsNow: true,
      shouldAddToHistory: false,
      shouldRestoreStashImmediately: false,
      shouldProvideDeferredStashRestore: false,
      shouldClearInputValue: false,
      shouldClearPastedContents: true,
      shouldResetInputMode: true,
      shouldIncrementSubmitCount: true,
      shouldClearBuffer: true,
      shouldShowProcessingPlaceholder: false,
    })
  })

  it('suppresses the processing placeholder for speculation accepts', () => {
    expect(
      resolveReplSubmitState({
        input: '',
        inputMode: 'prompt',
        isLoading: false,
        isRemoteMode: false,
        hasSpeculationAccept: true,
        fromKeybinding: false,
        hasStashedPrompt: false,
      }).shouldShowProcessingPlaceholder,
    ).toBe(false)
  })
})
