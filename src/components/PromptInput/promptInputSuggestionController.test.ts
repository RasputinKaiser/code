import { describe, expect, it } from 'bun:test'
import {
  derivePromptSuggestionRenderState,
  resolvePromptSuggestionSubmitIntent,
  shouldLogPromptSuggestionOutcome,
} from './promptInputSuggestionController.js'

describe('derivePromptSuggestionRenderState', () => {
  it('shows and marks a leader suggestion only when prompt mode is idle and suggestion UI is unobstructed', () => {
    expect(
      derivePromptSuggestionRenderState({
        mode: 'prompt',
        suggestionsCount: 0,
        promptSuggestion: 'finish the refactor',
        promptSuggestionState: {
          text: 'finish the refactor',
          shownAt: 0,
        },
        viewingAgentTaskId: null,
      }),
    ).toEqual({
      showPromptSuggestion: true,
      shouldMarkShown: true,
      shouldSuppressTiming: false,
    })

    expect(
      derivePromptSuggestionRenderState({
        mode: 'prompt',
        suggestionsCount: 2,
        promptSuggestion: 'finish the refactor',
        promptSuggestionState: {
          text: 'finish the refactor',
          shownAt: 0,
        },
        viewingAgentTaskId: null,
      }).showPromptSuggestion,
    ).toBe(false)
  })

  it('suppresses timing only for hidden leader suggestions that were never shown', () => {
    expect(
      derivePromptSuggestionRenderState({
        mode: 'prompt',
        suggestionsCount: 0,
        promptSuggestion: null,
        promptSuggestionState: {
          text: 'finish the refactor',
          shownAt: 0,
        },
        viewingAgentTaskId: null,
      }).shouldSuppressTiming,
    ).toBe(true)

    expect(
      derivePromptSuggestionRenderState({
        mode: 'prompt',
        suggestionsCount: 0,
        promptSuggestion: null,
        promptSuggestionState: {
          text: 'finish the refactor',
          shownAt: 0,
        },
        viewingAgentTaskId: 'agent-1',
      }).shouldSuppressTiming,
    ).toBe(false)
  })
})

describe('resolvePromptSuggestionSubmitIntent', () => {
  it('routes empty-enter suggestion acceptance into speculation when speculation is active', () => {
    expect(
      resolvePromptSuggestionSubmitIntent({
        inputParam: '',
        hasImages: false,
        promptSuggestionState: {
          text: 'finish the refactor',
          shownAt: 123,
        },
        viewingAgentTaskId: null,
        speculationStatus: 'active',
      }),
    ).toEqual({
      kind: 'accept-speculation',
      inputToSubmit: 'finish the refactor',
    })
  })

  it('accepts a shown suggestion normally when speculation is idle', () => {
    expect(
      resolvePromptSuggestionSubmitIntent({
        inputParam: '',
        hasImages: false,
        promptSuggestionState: {
          text: 'finish the refactor',
          shownAt: 123,
        },
        viewingAgentTaskId: null,
        speculationStatus: 'idle',
      }),
    ).toEqual({
      kind: 'accept-suggestion',
      inputToSubmit: 'finish the refactor',
    })
  })

  it('refuses auto-acceptance when images are attached or teammate view is active', () => {
    expect(
      resolvePromptSuggestionSubmitIntent({
        inputParam: '',
        hasImages: true,
        promptSuggestionState: {
          text: 'finish the refactor',
          shownAt: 123,
        },
        viewingAgentTaskId: null,
        speculationStatus: 'active',
      }),
    ).toEqual({
      kind: 'none',
      inputToSubmit: '',
    })

    expect(
      resolvePromptSuggestionSubmitIntent({
        inputParam: '',
        hasImages: false,
        promptSuggestionState: {
          text: 'finish the refactor',
          shownAt: 123,
        },
        viewingAgentTaskId: 'agent-1',
        speculationStatus: 'active',
      }),
    ).toEqual({
      kind: 'none',
      inputToSubmit: '',
    })
  })
})

describe('shouldLogPromptSuggestionOutcome', () => {
  it('only logs outcomes for suggestions that were actually shown', () => {
    expect(
      shouldLogPromptSuggestionOutcome({
        text: 'finish the refactor',
        shownAt: 123,
      }),
    ).toBe(true)

    expect(
      shouldLogPromptSuggestionOutcome({
        text: 'finish the refactor',
        shownAt: 0,
      }),
    ).toBe(false)

    expect(
      shouldLogPromptSuggestionOutcome({
        text: null,
        shownAt: 123,
      }),
    ).toBe(false)
  })
})
