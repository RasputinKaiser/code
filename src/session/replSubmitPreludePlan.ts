import type { Command } from '../commands.js'
import type { PastedContent } from '../utils/config.js'
import type { PromptInputMode } from '../types/textInputTypes.js'
import type { IdleReturnDialogPreflight } from './replSubmitPreflight.js'
import {
  resolveBackgroundPRLaunchGate,
  resolveBackgroundPRShortcutCandidate,
  resolveIdleReturnDialogPreflight,
  resolveImmediateLocalJsxPreflight,
} from './replSubmitPreflight.js'

export type ReplSubmitPreludePlan =
  | { type: 'background-pr-empty-prompt' }
  | { type: 'background-pr-images-unsupported' }
  | { type: 'background-pr-launch'; prompt: string }
  | { type: 'immediate-local-jsx'; commandArgs: string }
  | { type: 'skip-empty-remote' }
  | { type: 'idle-return-dialog'; preflight: IdleReturnDialogPreflight }
  | { type: 'continue' }

export type ResolveReplSubmitPreludePlanParams = {
  input: string
  inputMode: PromptInputMode
  hasSpeculationAccept: boolean
  fromKeybinding: boolean
  userType: string | undefined
  pastedContents: Record<number, PastedContent>
  queryGuardActive: boolean
  matchingCommand: Command | undefined
  isRemoteMode: boolean
  willowMode: string
  idleReturnDismissed: boolean
  skipIdleCheck: boolean
  lastQueryCompletionTimeMs: number
  totalInputTokens: number
  tokenThreshold: number
  idleThresholdMinutes: number
  nowMs: number
  expandPastedTextRefs: (
    input: string,
    pastedContents: Record<number, PastedContent>,
  ) => string
  parseBackgroundPRShortcutInput: (input: string) => string | null
}

export function resolveReplSubmitPreludePlan({
  input,
  inputMode,
  hasSpeculationAccept,
  fromKeybinding,
  userType,
  pastedContents,
  queryGuardActive,
  matchingCommand,
  isRemoteMode,
  willowMode,
  idleReturnDismissed,
  skipIdleCheck,
  lastQueryCompletionTimeMs,
  totalInputTokens,
  tokenThreshold,
  idleThresholdMinutes,
  nowMs,
  expandPastedTextRefs,
  parseBackgroundPRShortcutInput,
}: ResolveReplSubmitPreludePlanParams): ReplSubmitPreludePlan {
  const expandedInput = expandPastedTextRefs(input, pastedContents)

  const backgroundPRPrompt = resolveBackgroundPRShortcutCandidate({
    hasSpeculationAccept,
    inputMode,
    userType,
    expandedInput,
    parseBackgroundPRShortcutInput,
  })
  const backgroundPRLaunchGate = resolveBackgroundPRLaunchGate({
    backgroundPRPrompt,
    isRemoteMode,
    pastedContents,
  })
  switch (backgroundPRLaunchGate) {
    case 'empty_prompt':
      return { type: 'background-pr-empty-prompt' }
    case 'images_unsupported':
      return { type: 'background-pr-images-unsupported' }
    case 'launch':
      return { type: 'background-pr-launch', prompt: backgroundPRPrompt! }
    default:
      break
  }

  const immediatePreflight = resolveImmediateLocalJsxPreflight({
    hasSpeculationAccept,
    input,
    expandedInput,
    queryGuardActive,
    fromKeybinding,
    matchingCommand,
  })
  if (immediatePreflight.shouldExecuteLocalJsxImmediate && matchingCommand) {
    return {
      type: 'immediate-local-jsx',
      commandArgs: immediatePreflight.commandArgs,
    }
  }

  if (isRemoteMode && !input.trim()) {
    return { type: 'skip-empty-remote' }
  }

  const idleReturnPreflight = resolveIdleReturnDialogPreflight({
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
  })
  if (idleReturnPreflight.shouldOpenDialog) {
    return {
      type: 'idle-return-dialog',
      preflight: idleReturnPreflight,
    }
  }

  return { type: 'continue' }
}
