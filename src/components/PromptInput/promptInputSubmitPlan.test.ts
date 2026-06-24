import { describe, expect, it } from 'bun:test'
import {
  resolvePromptInputSubmitPlan,
  type PromptInputSubmitPlan,
} from './promptInputSubmitPlan.js'

function getProceedResult(
  result: PromptInputSubmitPlan,
): Extract<PromptInputSubmitPlan, { kind: 'proceed' }> {
  expect(result.kind).toBe('proceed')
  return result
}

describe('resolvePromptInputSubmitPlan', () => {
  it('blocks submit while a visible footer pill is selected', () => {
    expect(
      resolvePromptInputSubmitPlan({
        inputParam: 'hello',
        footerSelectionVisible: true,
        viewSelectionMode: null,
        hasImages: false,
        suggestions: [],
        isSubmittingSlashCommand: false,
        promptSuggestionState: {
          text: null,
          shownAt: 0,
        },
        viewingAgentTaskId: null,
        speculationStatus: 'idle',
      }),
    ).toEqual({
      kind: 'blocked',
      reason: 'footer_selected',
    })
  })

  it('blocks submit while agent selection mode is active', () => {
    expect(
      resolvePromptInputSubmitPlan({
        inputParam: 'hello',
        footerSelectionVisible: false,
        viewSelectionMode: 'selecting-agent',
        hasImages: false,
        suggestions: [],
        isSubmittingSlashCommand: false,
        promptSuggestionState: {
          text: null,
          shownAt: 0,
        },
        viewingAgentTaskId: null,
        speculationStatus: 'idle',
      }),
    ).toEqual({
      kind: 'blocked',
      reason: 'selecting_agent',
    })
  })

  it('keeps empty text submits blocked unless images are attached', () => {
    expect(
      resolvePromptInputSubmitPlan({
        inputParam: '   ',
        footerSelectionVisible: false,
        viewSelectionMode: null,
        hasImages: false,
        suggestions: [],
        isSubmittingSlashCommand: false,
        promptSuggestionState: {
          text: null,
          shownAt: 0,
        },
        viewingAgentTaskId: null,
        speculationStatus: 'idle',
      }),
    ).toEqual({
      kind: 'blocked',
      reason: 'empty_without_images',
    })

    const withImages = getProceedResult(
      resolvePromptInputSubmitPlan({
        inputParam: '   ',
        footerSelectionVisible: false,
        viewSelectionMode: null,
        hasImages: true,
        suggestions: [],
        isSubmittingSlashCommand: false,
        promptSuggestionState: {
          text: null,
          shownAt: 0,
        },
        viewingAgentTaskId: null,
        speculationStatus: 'idle',
      }),
    )

    expect(withImages.inputToSubmit).toBe('   ')
  })

  it('blocks non-directory suggestions but allows slash-submit and directory-only suggestions', () => {
    expect(
      resolvePromptInputSubmitPlan({
        inputParam: '/assist',
        footerSelectionVisible: false,
        viewSelectionMode: null,
        hasImages: false,
        suggestions: [
          {
            id: 'command-assist',
            displayText: '/assistant',
            description: 'command',
          },
        ],
        isSubmittingSlashCommand: false,
        promptSuggestionState: {
          text: null,
          shownAt: 0,
        },
        viewingAgentTaskId: null,
        speculationStatus: 'idle',
      }),
    ).toEqual({
      kind: 'blocked',
      reason: 'suggestions_open',
    })

    expect(
      resolvePromptInputSubmitPlan({
        inputParam: '/assist',
        footerSelectionVisible: false,
        viewSelectionMode: null,
        hasImages: false,
        suggestions: [
          {
            id: 'command-assist',
            displayText: '/assistant',
            description: 'command',
          },
        ],
        isSubmittingSlashCommand: true,
        promptSuggestionState: {
          text: null,
          shownAt: 0,
        },
        viewingAgentTaskId: null,
        speculationStatus: 'idle',
      }),
    ).toEqual({
      kind: 'proceed',
      inputToSubmit: '/assist',
      promptSuggestionIntent: {
        kind: 'none',
        inputToSubmit: '/assist',
      },
      shouldLogPromptSuggestionOutcome: false,
    })

    expect(
      resolvePromptInputSubmitPlan({
        inputParam: '@src',
        footerSelectionVisible: false,
        viewSelectionMode: null,
        hasImages: false,
        suggestions: [
          {
            id: 'dir-src',
            displayText: 'src',
            description: 'directory',
          },
        ],
        isSubmittingSlashCommand: false,
        promptSuggestionState: {
          text: null,
          shownAt: 0,
        },
        viewingAgentTaskId: null,
        speculationStatus: 'idle',
      }),
    ).toEqual({
      kind: 'proceed',
      inputToSubmit: '@src',
      promptSuggestionIntent: {
        kind: 'none',
        inputToSubmit: '@src',
      },
      shouldLogPromptSuggestionOutcome: false,
    })
  })

  it('allows empty bash submits while still blocking empty prompt submits', () => {
    const bashEmpty = resolvePromptInputSubmitPlan({
      inputParam: '',
      inputMode: 'bash',
      footerSelectionVisible: false,
      viewSelectionMode: null,
      hasImages: false,
      suggestions: [],
      isSubmittingSlashCommand: false,
      promptSuggestionState: {
        text: null,
        shownAt: 0,
      },
      viewingAgentTaskId: null,
      speculationStatus: 'idle',
    })

    expect(bashEmpty).toEqual({
      kind: 'proceed',
      inputToSubmit: '',
      promptSuggestionIntent: {
        kind: 'none',
        inputToSubmit: '',
      },
      shouldLogPromptSuggestionOutcome: false,
    })

    const promptEmpty = resolvePromptInputSubmitPlan({
      inputParam: '',
      inputMode: 'prompt',
      footerSelectionVisible: false,
      viewSelectionMode: null,
      hasImages: false,
      suggestions: [],
      isSubmittingSlashCommand: false,
      promptSuggestionState: {
        text: null,
        shownAt: 0,
      },
      viewingAgentTaskId: null,
      speculationStatus: 'idle',
    })

    expect(promptEmpty).toEqual({
      kind: 'blocked',
      reason: 'empty_without_images',
    })
  })

  it('preserves suggestion acceptance and outcome logging semantics', () => {
    const suggestionResult = getProceedResult(
      resolvePromptInputSubmitPlan({
        inputParam: '',
        footerSelectionVisible: false,
        viewSelectionMode: null,
        hasImages: false,
        suggestions: [],
        isSubmittingSlashCommand: false,
        promptSuggestionState: {
          text: 'rewrite the query',
          shownAt: 123,
        },
        viewingAgentTaskId: null,
        speculationStatus: 'idle',
      }),
    )

    expect(suggestionResult).toEqual({
      kind: 'proceed',
      inputToSubmit: 'rewrite the query',
      promptSuggestionIntent: {
        kind: 'accept-suggestion',
        inputToSubmit: 'rewrite the query',
      },
      shouldLogPromptSuggestionOutcome: true,
    })

    const speculationResult = getProceedResult(
      resolvePromptInputSubmitPlan({
        inputParam: '',
        footerSelectionVisible: false,
        viewSelectionMode: null,
        hasImages: false,
        suggestions: [],
        isSubmittingSlashCommand: false,
        promptSuggestionState: {
          text: 'rewrite the query',
          shownAt: 123,
        },
        viewingAgentTaskId: null,
        speculationStatus: 'active',
      }),
    )

    expect(speculationResult.promptSuggestionIntent).toEqual({
      kind: 'accept-speculation',
      inputToSubmit: 'rewrite the query',
    })
  })
})
