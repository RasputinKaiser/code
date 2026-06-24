import type { PromptInputHelpers } from '../utils/handlePromptSubmit.js'
import { parseReferences } from '../history.js'
import type { PastedContent } from '../utils/config.js'
import type { AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS } from 'src/services/analytics/index.js'
import {
  executeImmediateLocalJsxCommand,
  type ExecuteImmediateLocalJsxCommandOptions,
  type ImmediateLocalJsxCommandDeps,
} from './immediateLocalJsxCommand.js'

export type ImmediateLocalJsxSubmitDispatchOptions = {
  input: string
  getInputValue: () => string
  helpers: Pick<PromptInputHelpers, 'setCursorOffset' | 'clearBuffer'>
  pastedContents: Record<number, PastedContent>
  command: ExecuteImmediateLocalJsxCommandOptions['command']
  commandArgs: string
  commandName: string
  fromKeybinding: boolean
  fullscreenEnabled: boolean
  mainLoopModel: string
  stashedPrompt:
    | {
        text: string
        cursorOffset: number
        pastedContents: Record<number, PastedContent>
      }
    | undefined
}

export type ImmediateLocalJsxSubmitDispatchDeps = ImmediateLocalJsxCommandDeps & {
  setInputValue: (value: string) => void
  setPastedContents: (value: Record<number, PastedContent>) => void
  setStashedPrompt: (
    value:
      | {
          text: string
          cursorOffset: number
          pastedContents: Record<number, PastedContent>
        }
      | undefined,
  ) => void
  logEvent: (name: string, payload: Record<string, unknown>) => void
  executeImmediateLocalJsxCommandImpl?: typeof executeImmediateLocalJsxCommand
}

export function dispatchImmediateLocalJsxSubmit(
  {
    input,
    getInputValue,
    helpers,
    pastedContents,
    command,
    commandArgs,
    commandName,
    fromKeybinding,
    fullscreenEnabled,
    mainLoopModel,
    stashedPrompt,
  }: ImmediateLocalJsxSubmitDispatchOptions,
  {
    setInputValue,
    setPastedContents,
    setStashedPrompt,
    logEvent,
    executeImmediateLocalJsxCommandImpl = executeImmediateLocalJsxCommand,
    ...commandDeps
  }: ImmediateLocalJsxSubmitDispatchDeps,
): void {
  if (input.trim() === getInputValue().trim()) {
    setInputValue('')
    helpers.setCursorOffset(0)
    helpers.clearBuffer()
    setPastedContents({})
  }

  const pastedTextRefs = parseReferences(input).filter(
    r => pastedContents[r.id]?.type === 'text',
  )
  const pastedTextCount = pastedTextRefs.length
  const pastedTextBytes = pastedTextRefs.reduce(
    (sum, r) => sum + (pastedContents[r.id]?.content.length ?? 0),
    0,
  )
  logEvent('ncode_paste_text', {
    pastedTextCount,
    pastedTextBytes,
  })
  logEvent('ncode_immediate_command_executed', {
    commandName:
      command.name as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    fromKeybinding,
  })

  void executeImmediateLocalJsxCommandImpl(
    {
      command,
      commandArgs,
      commandName,
      commandNotificationName: command.name,
      fullscreenEnabled,
      mainLoopModel,
      restoreStashedPrompt:
        stashedPrompt !== undefined
          ? () => {
              setInputValue(stashedPrompt.text)
              helpers.setCursorOffset(stashedPrompt.cursorOffset)
              setPastedContents(stashedPrompt.pastedContents)
              setStashedPrompt(undefined)
            }
          : undefined,
    },
    commandDeps,
  )
}
