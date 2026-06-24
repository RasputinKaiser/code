import type { ResumeEntrypoint } from '../types/command.js'
import type { ContentReplacementRecord } from '../utils/toolResultStorage.js'
import type { Message } from '../types/message.js'

export type ReplResumeFinalizeDispatchDeps = {
  messages: Message[]
  entrypoint: ResumeEntrypoint
  contentReplacementState: unknown
  contentReplacementRecords: ContentReplacementRecord[] | undefined
  reconstructContentReplacementState: (
    messages: Message[],
    records: ContentReplacementRecord[],
  ) => unknown
  setContentReplacementState: (state: unknown) => void
  commitMessages: (messages: Message[]) => void
  clearToolJSX: () => void
  clearInputValue: () => void
}

export function dispatchReplResumeFinalize({
  messages,
  entrypoint,
  contentReplacementState,
  contentReplacementRecords,
  reconstructContentReplacementState,
  setContentReplacementState,
  commitMessages,
  clearToolJSX,
  clearInputValue,
}: ReplResumeFinalizeDispatchDeps): void {
  if (contentReplacementState && entrypoint !== 'fork') {
    setContentReplacementState(
      reconstructContentReplacementState(
        messages,
        contentReplacementRecords ?? [],
      ),
    )
  }

  commitMessages(messages)
  clearToolJSX()
  clearInputValue()
}
