import type { Command } from '../commands.js'
import type { PromptInputMode } from '../types/textInputTypes.js'
import type { PastedContent } from '../utils/config.js'

export type BackgroundPRLaunchGate =
  | 'skip'
  | 'empty_prompt'
  | 'images_unsupported'
  | 'launch'

type ResolveBackgroundPRLaunchGateParams = {
  backgroundPRPrompt: string | null
  isRemoteMode: boolean
  pastedContents: Record<number, PastedContent>
}

export function resolveBackgroundPRLaunchGate({
  backgroundPRPrompt,
  isRemoteMode,
  pastedContents,
}: ResolveBackgroundPRLaunchGateParams): BackgroundPRLaunchGate {
  if (backgroundPRPrompt === null || isRemoteMode) {
    return 'skip'
  }

  if (backgroundPRPrompt.length === 0) {
    return 'empty_prompt'
  }

  const hasImagePastes = Object.values(pastedContents).some(
    value => value.type === 'image',
  )
  if (hasImagePastes) {
    return 'images_unsupported'
  }

  return 'launch'
}

type ResolveImmediateLocalJsxPreflightParams = {
  hasSpeculationAccept: boolean
  input: string
  expandedInput: string
  queryGuardActive: boolean
  fromKeybinding: boolean
  matchingCommand: Command | undefined
}

export type ImmediateLocalJsxPreflight = {
  shouldEnterSlashPreflight: boolean
  shouldTreatAsImmediate: boolean
  shouldExecuteLocalJsxImmediate: boolean
  commandArgs: string
}

export function resolveImmediateLocalJsxPreflight({
  hasSpeculationAccept,
  input,
  expandedInput,
  queryGuardActive,
  fromKeybinding,
  matchingCommand,
}: ResolveImmediateLocalJsxPreflightParams): ImmediateLocalJsxPreflight {
  const shouldEnterSlashPreflight =
    !hasSpeculationAccept && input.trim().startsWith('/')

  const trimmedInput = expandedInput.trim()
  const spaceIndex = trimmedInput.indexOf(' ')
  const commandArgs =
    spaceIndex === -1 ? '' : trimmedInput.slice(spaceIndex + 1).trim()

  const shouldTreatAsImmediate =
    queryGuardActive && !!(matchingCommand?.immediate || fromKeybinding)
  const shouldExecuteLocalJsxImmediate =
    shouldEnterSlashPreflight &&
    !!matchingCommand &&
    shouldTreatAsImmediate &&
    matchingCommand.type === 'local-jsx'

  return {
    shouldEnterSlashPreflight,
    shouldTreatAsImmediate,
    shouldExecuteLocalJsxImmediate,
    commandArgs,
  }
}

type ResolveIdleReturnDialogPreflightParams = {
  willowMode: string
  idleReturnDismissed: boolean
  skipIdleCheck: boolean
  hasSpeculationAccept: boolean
  input: string
  lastQueryCompletionTimeMs: number
  totalInputTokens: number
  tokenThreshold: number
  idleThresholdMinutes: number
  nowMs: number
}

export type IdleReturnDialogPreflight = {
  shouldOpenDialog: boolean
  idleMinutes: number
}

export function resolveIdleReturnDialogPreflight({
  willowMode,
  idleReturnDismissed,
  skipIdleCheck,
  hasSpeculationAccept,
  input,
  lastQueryCompletionTimeMs,
  totalInputTokens,
  tokenThreshold,
  idleThresholdMinutes,
  nowMs,
}: ResolveIdleReturnDialogPreflightParams): IdleReturnDialogPreflight {
  if (
    willowMode === 'off' ||
    idleReturnDismissed ||
    skipIdleCheck ||
    hasSpeculationAccept ||
    input.trim().startsWith('/') ||
    lastQueryCompletionTimeMs <= 0 ||
    totalInputTokens < tokenThreshold
  ) {
    return {
      shouldOpenDialog: false,
      idleMinutes: 0,
    }
  }

  const idleMinutes = (nowMs - lastQueryCompletionTimeMs) / 60_000
  return {
    shouldOpenDialog:
      willowMode === 'dialog' && idleMinutes >= idleThresholdMinutes,
    idleMinutes,
  }
}

type ResolveBackgroundPRShortcutCandidateParams = {
  hasSpeculationAccept: boolean
  inputMode: PromptInputMode
  userType: string | undefined
  expandedInput: string
  parseBackgroundPRShortcutInput: (input: string) => string | null
}

export function resolveBackgroundPRShortcutCandidate({
  hasSpeculationAccept,
  inputMode,
  userType,
  expandedInput,
  parseBackgroundPRShortcutInput,
}: ResolveBackgroundPRShortcutCandidateParams): string | null {
  if (hasSpeculationAccept || inputMode !== 'prompt' || userType !== 'ant') {
    return null
  }
  return parseBackgroundPRShortcutInput(expandedInput)
}
