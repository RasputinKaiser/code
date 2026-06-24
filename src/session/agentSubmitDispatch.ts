import { errorMessage } from '../utils/errors.js'

export async function dispatchAgentSubmit(
  {
    input,
    taskId,
    isLocalAgentTask,
    isRunning,
  }: {
    input: string
    taskId: string
    isLocalAgentTask: boolean
    isRunning: boolean
  },
  {
    appendMessageToLocalAgent,
    queuePendingMessage,
    resumeLocalAgentBackground,
    injectUserMessageToTeammate,
    logDebug,
    notifyResumeAgentFailed,
    clearInput,
    setCursorOffset,
    clearBuffer,
  }: {
    appendMessageToLocalAgent: (taskId: string, input: string) => void
    queuePendingMessage: (taskId: string, input: string) => void
    resumeLocalAgentBackground: (taskId: string, input: string) => Promise<void>
    injectUserMessageToTeammate: (taskId: string, input: string) => void
    logDebug: (message: string) => void
    notifyResumeAgentFailed: (taskId: string, message: string) => void
    clearInput: () => void
    setCursorOffset: (value: number) => void
    clearBuffer: () => void
  },
): Promise<void> {
  if (isLocalAgentTask) {
    appendMessageToLocalAgent(taskId, input)
    if (isRunning) {
      queuePendingMessage(taskId, input)
    } else {
      try {
        await resumeLocalAgentBackground(taskId, input)
      } catch (err) {
        const message = errorMessage(err)
        logDebug(`resumeAgentBackground failed: ${message}`)
        notifyResumeAgentFailed(taskId, message)
      }
    }
  } else {
    injectUserMessageToTeammate(taskId, input)
  }

  clearInput()
  setCursorOffset(0)
  clearBuffer()
}
