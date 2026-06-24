import { describe, expect, it } from 'bun:test'
import { derivePromptInputDisplayModel } from './promptInputDisplayModel.js'

describe('derivePromptInputDisplayModel', () => {
  it('keeps only valid slash commands, preserves teammate highlights, and inverts the selected image chip', () => {
    const displayedValue = '/valid /missing @alice [Image #1]'
    const imageStart = displayedValue.indexOf('[Image #1]')
    const imageEnd = imageStart + '[Image #1]'.length
    const result = derivePromptInputDisplayModel({
      displayedValue,
      cursorOffset: imageStart,
      isSearchingHistory: false,
      historyQuery: '',
      hasHistoryMatch: false,
      historyFailedMatch: false,
      validCommandNames: new Set(['valid']),
      teammateThemeColorByName: new Map([['alice', 'suggestion']]),
      slackChannelsEnabled: false,
      ultraplanEnabled: false,
      ultrareviewEnabled: false,
      tokenBudgetEnabled: false,
    })

    expect(result.imageRefPositions).toEqual([
      {
        start: imageStart,
        end: imageEnd,
      },
    ])
    expect(result.cursorAtImageChip).toBe(true)
    expect(result.combinedHighlights).toContainEqual({
      start: imageStart,
      end: imageEnd,
      color: undefined,
      inverse: true,
      priority: 8,
    })
    expect(result.combinedHighlights).toContainEqual({
      start: displayedValue.indexOf('@alice'),
      end: displayedValue.indexOf('@alice') + '@alice'.length,
      color: 'suggestion',
      priority: 5,
    })
    expect(
      result.combinedHighlights.filter(
        highlight =>
          highlight.color === 'suggestion' &&
          highlight.start === 0 &&
          highlight.end === '/valid'.length,
      ),
    ).toHaveLength(1)
    expect(
      result.combinedHighlights.some(
        highlight =>
          highlight.start === displayedValue.indexOf('/missing') &&
          highlight.end === displayedValue.indexOf('/missing') + '/missing'.length,
      ),
    ).toBe(false)
  })

  it('preserves history-search and interim-voice overlays', () => {
    const result = derivePromptInputDisplayModel({
      displayedValue: 'hello world',
      cursorOffset: 2,
      isSearchingHistory: true,
      historyQuery: 'll',
      hasHistoryMatch: true,
      historyFailedMatch: false,
      voiceInterimRange: {
        start: 6,
        end: 11,
      },
      validCommandNames: new Set(),
      teammateThemeColorByName: new Map(),
      slackChannelsEnabled: false,
      ultraplanEnabled: false,
      ultrareviewEnabled: false,
      tokenBudgetEnabled: false,
    })

    expect(result.combinedHighlights).toContainEqual({
      start: 2,
      end: 4,
      color: 'warning',
      priority: 20,
    })
    expect(result.combinedHighlights).toContainEqual({
      start: 6,
      end: 11,
      color: undefined,
      dimColor: true,
      priority: 1,
    })
  })
})
