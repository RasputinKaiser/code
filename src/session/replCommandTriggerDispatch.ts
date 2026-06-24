import type { PromptInputHelpers } from '../utils/handlePromptSubmit.js'
import { errorMessage } from '../utils/errors.js'
import { getAutoRunCommand, type AutoRunIssueReason } from '../utils/autoRunIssue.js'

const EMPTY_PROMPT_INPUT_HELPERS: PromptInputHelpers = {
  setCursorOffset: () => {},
  clearBuffer: () => {},
  resetHistory: () => {},
}

export function dispatchReplAutoRunIssue(
  state: {
    autoRunIssueReason: AutoRunIssueReason | null
  },
  deps: {
    clearAutoRunIssueReason: () => void
    submit: (command: string, helpers: PromptInputHelpers) => Promise<unknown>
    logDebug: (message: string) => void
  },
): void {
  const command = state.autoRunIssueReason ? getAutoRunCommand(state.autoRunIssueReason) : '/issue'
  deps.clearAutoRunIssueReason()
  deps.submit(command, EMPTY_PROMPT_INPUT_HELPERS).catch(err => {
    deps.logDebug(`Auto-run ${command} failed: ${errorMessage(err)}`)
  })
}

export function dispatchReplSurveyFeedback(
  state: {
    userType: string | undefined
  },
  deps: {
    submit: (command: string, helpers: PromptInputHelpers) => Promise<unknown>
    logDebug: (message: string) => void
  },
): void {
  const command = state.userType === 'ant' ? '/issue' : '/feedback'
  deps.submit(command, EMPTY_PROMPT_INPUT_HELPERS).catch(err => {
    deps.logDebug(`Survey feedback request failed: ${err instanceof Error ? err.message : String(err)}`)
  })
}

export function dispatchReplCommandTrigger(
  command: string,
  deps: {
    submit: (command: string, helpers: PromptInputHelpers) => Promise<unknown>
  },
): void {
  void deps.submit(command, EMPTY_PROMPT_INPUT_HELPERS)
}
