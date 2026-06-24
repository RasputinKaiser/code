import * as React from 'react'
import { renderFeedbackComponent } from '../feedback/feedback.js'
import type { LocalJSXCommandContext } from '../../commands.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  args?: string,
): Promise<React.ReactNode> {
  const initialDescription = args || ''
  return renderFeedbackComponent(
    onDone,
    context.abortController.signal,
    context.messages,
    initialDescription,
    context.getAppState().tasks as Parameters<typeof renderFeedbackComponent>[4],
  )
}
