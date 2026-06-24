import { feature } from 'bun:bundle'
import { useMemo, useSyncExternalStore } from 'react'
import { findBuddyTriggerPositions } from '../../buddy/useBuddyNotification.js'
import { getCommandName, type Command } from '../../commands.js'
import { parseReferences } from '../../history.js'
import type { AppState } from '../../state/AppState.js'
import { AGENT_COLOR_TO_THEME_COLOR, type AgentColorName } from '../../tools/AgentTool/agentColorManager.js'
import type { TextHighlight } from '../../utils/textHighlighting.js'
import type { Theme } from '../../utils/theme.js'
import { findThinkingTriggerPositions, getRainbowColor, isUltrathinkEnabled } from '../../utils/thinking.js'
import { findBtwTriggerPositions } from '../../utils/sideQuestion.js'
import { findSlashCommandPositions, type Position } from '../../utils/suggestions/commandSuggestions.js'
import {
  findSlackChannelPositions,
  getKnownChannelsVersion,
  subscribeKnownChannels,
} from '../../utils/suggestions/slackChannelSuggestions.js'
import { findTokenBudgetPositions } from '../../utils/tokenBudget.js'
import { findUltraplanTriggerPositions, findUltrareviewTriggerPositions } from '../../utils/ultraplan/keyword.js'
import { getValueFromInput } from './inputModes.js'
import { isUltrareviewEnabled } from '../../commands/review/ultrareviewEnabled.js'

type VoiceInterimRange = {
  start: number
  end: number
}

type HistoryMatchDisplay = string | { display: string } | null | undefined

type PromptInputDisplayModelArgs = {
  displayedValue: string
  cursorOffset: number
  isSearchingHistory: boolean
  historyQuery: string
  hasHistoryMatch: boolean
  historyFailedMatch: boolean
  voiceInterimRange?: VoiceInterimRange
  validCommandNames: ReadonlySet<string>
  teammateThemeColorByName: ReadonlyMap<string, keyof Theme>
  slackChannelsEnabled: boolean
  ultraplanEnabled: boolean
  ultrareviewEnabled: boolean
  tokenBudgetEnabled: boolean
}

type TeammateMentionHighlight = {
  start: number
  end: number
  themeColor: keyof Theme
}

type ImageRefPosition = {
  start: number
  end: number
}

export type PromptInputDisplayModel = {
  displayedValue: string
  thinkTriggers: Position[]
  ultraplanTriggers: Position[]
  ultrareviewTriggers: Position[]
  imageRefPositions: ImageRefPosition[]
  cursorAtImageChip: boolean
  combinedHighlights: TextHighlight[]
}

type UsePromptInputDisplayModelArgs = {
  input: string
  cursorOffset: number
  isSearchingHistory: boolean
  historyQuery: string
  historyMatch: HistoryMatchDisplay
  historyFailedMatch: boolean
  commands: Command[]
  teamContext: AppState['teamContext']
  voiceInterimRange?: VoiceInterimRange
  slackChannelsEnabled: boolean
  ultraplanEnabled: boolean
}

function deriveValidCommandNames(commands: Command[]): Set<string> {
  const names = new Set<string>()
  for (const command of commands) {
    names.add(command.name)
    names.add(getCommandName(command))
    for (const alias of command.aliases ?? []) {
      names.add(alias)
    }
  }
  return names
}

function deriveTeammateThemeColorByName(
  teamContext: AppState['teamContext'],
): Map<string, keyof Theme> {
  const teammates = teamContext?.teammates
  if (!teammates) {
    return new Map()
  }

  const teammateThemeColorByName = new Map<string, keyof Theme>()
  for (const teammate of Object.values(teammates)) {
    if (!teammate.color) {
      continue
    }
    const themeColor =
      AGENT_COLOR_TO_THEME_COLOR[teammate.color as AgentColorName]
    if (themeColor) {
      teammateThemeColorByName.set(teammate.name, themeColor)
    }
  }
  return teammateThemeColorByName
}

function deriveMemberMentionHighlights(
  displayedValue: string,
  teammateThemeColorByName: ReadonlyMap<string, keyof Theme>,
): TeammateMentionHighlight[] {
  if (teammateThemeColorByName.size === 0) {
    return []
  }

  const highlights: TeammateMentionHighlight[] = []
  const regex = /(^|\s)@([\w-]+)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(displayedValue)) !== null) {
    const leadingSpace = match[1] ?? ''
    const mentionStart = match.index + leadingSpace.length
    const mentionText = match[0].trimStart()
    const themeColor = teammateThemeColorByName.get(match[2]!)
    if (themeColor) {
      highlights.push({
        start: mentionStart,
        end: mentionStart + mentionText.length,
        themeColor,
      })
    }
  }
  return highlights
}

function deriveImageRefPositions(displayedValue: string): ImageRefPosition[] {
  return parseReferences(displayedValue)
    .filter(reference => reference.match.startsWith('[Image'))
    .map(reference => ({
      start: reference.index,
      end: reference.index + reference.match.length,
    }))
}

function buildRainbowHighlights(triggers: Position[]): TextHighlight[] {
  const highlights: TextHighlight[] = []
  for (const trigger of triggers) {
    for (let index = trigger.start; index < trigger.end; index += 1) {
      const rainbowOffset = index - trigger.start
      highlights.push({
        start: index,
        end: index + 1,
        color: getRainbowColor(rainbowOffset),
        shimmerColor: getRainbowColor(rainbowOffset, true),
        priority: 10,
      })
    }
  }
  return highlights
}

export function derivePromptInputDisplayModel({
  displayedValue,
  cursorOffset,
  isSearchingHistory,
  historyQuery,
  hasHistoryMatch,
  historyFailedMatch,
  voiceInterimRange,
  validCommandNames,
  teammateThemeColorByName,
  slackChannelsEnabled,
  ultraplanEnabled,
  ultrareviewEnabled,
  tokenBudgetEnabled,
}: PromptInputDisplayModelArgs): Omit<
  PromptInputDisplayModel,
  'displayedValue'
> {
  const thinkTriggers = findThinkingTriggerPositions(displayedValue)
  const ultraplanTriggers = ultraplanEnabled
    ? findUltraplanTriggerPositions(displayedValue)
    : []
  const ultrareviewTriggers = ultrareviewEnabled
    ? findUltrareviewTriggerPositions(displayedValue)
    : []
  const btwTriggers = findBtwTriggerPositions(displayedValue)
  const buddyTriggers = findBuddyTriggerPositions(displayedValue)
  const slashCommandTriggers = findSlashCommandPositions(displayedValue).filter(
    position =>
      validCommandNames.has(
        displayedValue.slice(position.start + 1, position.end),
      ),
  )
  const tokenBudgetTriggers = tokenBudgetEnabled
    ? findTokenBudgetPositions(displayedValue)
    : []
  const slackChannelTriggers = slackChannelsEnabled
    ? findSlackChannelPositions(displayedValue)
    : []
  const memberMentionHighlights = deriveMemberMentionHighlights(
    displayedValue,
    teammateThemeColorByName,
  )
  const imageRefPositions = deriveImageRefPositions(displayedValue)
  const cursorAtImageChip = imageRefPositions.some(
    imageRef => imageRef.start === cursorOffset,
  )

  const combinedHighlights: TextHighlight[] = []

  for (const imageRef of imageRefPositions) {
    if (cursorOffset === imageRef.start) {
      combinedHighlights.push({
        start: imageRef.start,
        end: imageRef.end,
        color: undefined,
        inverse: true,
        priority: 8,
      })
    }
  }

  if (isSearchingHistory && hasHistoryMatch && !historyFailedMatch) {
    combinedHighlights.push({
      start: cursorOffset,
      end: cursorOffset + historyQuery.length,
      color: 'warning',
      priority: 20,
    })
  }

  for (const trigger of btwTriggers) {
    combinedHighlights.push({
      start: trigger.start,
      end: trigger.end,
      color: 'warning',
      priority: 15,
    })
  }

  for (const trigger of slashCommandTriggers) {
    combinedHighlights.push({
      start: trigger.start,
      end: trigger.end,
      color: 'suggestion',
      priority: 5,
    })
  }

  for (const trigger of tokenBudgetTriggers) {
    combinedHighlights.push({
      start: trigger.start,
      end: trigger.end,
      color: 'suggestion',
      priority: 5,
    })
  }

  for (const trigger of slackChannelTriggers) {
    combinedHighlights.push({
      start: trigger.start,
      end: trigger.end,
      color: 'suggestion',
      priority: 5,
    })
  }

  for (const mention of memberMentionHighlights) {
    combinedHighlights.push({
      start: mention.start,
      end: mention.end,
      color: mention.themeColor,
      priority: 5,
    })
  }

  if (voiceInterimRange) {
    combinedHighlights.push({
      start: voiceInterimRange.start,
      end: voiceInterimRange.end,
      color: undefined,
      dimColor: true,
      priority: 1,
    })
  }

  if (isUltrathinkEnabled()) {
    combinedHighlights.push(...buildRainbowHighlights(thinkTriggers))
  }

  if (ultraplanEnabled) {
    combinedHighlights.push(...buildRainbowHighlights(ultraplanTriggers))
  }

  combinedHighlights.push(...buildRainbowHighlights(ultrareviewTriggers))
  combinedHighlights.push(...buildRainbowHighlights(buddyTriggers))

  return {
    thinkTriggers,
    ultraplanTriggers,
    ultrareviewTriggers,
    imageRefPositions,
    cursorAtImageChip,
    combinedHighlights,
  }
}

export function usePromptInputDisplayModel({
  input,
  cursorOffset,
  isSearchingHistory,
  historyQuery,
  historyMatch,
  historyFailedMatch,
  commands,
  teamContext,
  voiceInterimRange,
  slackChannelsEnabled,
  ultraplanEnabled,
}: UsePromptInputDisplayModelArgs): PromptInputDisplayModel {
  const knownChannelsVersion = useSyncExternalStore(
    subscribeKnownChannels,
    getKnownChannelsVersion,
  )
  const displayedValue = useMemo(
    () =>
      isSearchingHistory && historyMatch
        ? getValueFromInput(
            typeof historyMatch === 'string'
              ? historyMatch
              : historyMatch.display,
          )
        : input,
    [historyMatch, input, isSearchingHistory],
  )
  const validCommandNames = useMemo(
    () => deriveValidCommandNames(commands),
    [commands],
  )
  const teammateThemeColorByName = useMemo(
    () => deriveTeammateThemeColorByName(teamContext),
    [teamContext],
  )
  const tokenBudgetEnabled = feature('TOKEN_BUDGET') ? true : false
  const displayModel = useMemo(
    () =>
      derivePromptInputDisplayModel({
        displayedValue,
        cursorOffset,
        isSearchingHistory,
        historyQuery,
        hasHistoryMatch: !!historyMatch,
        historyFailedMatch,
        voiceInterimRange,
        validCommandNames,
        teammateThemeColorByName,
        slackChannelsEnabled,
        ultraplanEnabled,
        ultrareviewEnabled: isUltrareviewEnabled(),
        tokenBudgetEnabled,
      }),
    [
      cursorOffset,
      displayedValue,
      historyFailedMatch,
      historyMatch,
      historyQuery,
      isSearchingHistory,
      knownChannelsVersion,
      slackChannelsEnabled,
      teammateThemeColorByName,
      tokenBudgetEnabled,
      ultraplanEnabled,
      validCommandNames,
      voiceInterimRange,
    ],
  )

  return {
    displayedValue,
    ...displayModel,
  }
}
