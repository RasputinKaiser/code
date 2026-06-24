import { getRenderTrace } from '../../ink/renderTrace.js'
import type { ToolUseContext } from '../../Tool.js'
import type { LocalCommandResult } from '../../types/command.js'

export async function call(
  args: string,
  _context: ToolUseContext,
): Promise<LocalCommandResult> {
  const trace = getRenderTrace()
  const cleanArgs = args.trim().toLowerCase()

  if (cleanArgs === 'full') {
    trace.armFullCapture()
    return {
      type: 'text',
      value:
        'Full capture armed for next 32 natural frames with row content and ANSI. ' +
        'No repaint triggered — corruption state is preserved. ' +
        'Privacy warning: traces may contain secrets. ' +
        'Type /render-trace to dump when ready.',
    }
  }

  if (cleanArgs === 'status') {
    const status = trace.status
    const remaining = trace.framesUntilFullDisable
    return {
      type: 'text',
      value: `Status: ${status} | Full frames remaining: ${remaining}`,
    }
  }

  // Default: dump
  try {
    const path = trace.dumpSync()
    return { type: 'text', value: `Render trace dumped to:\n${path}` }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { type: 'text', value: `Failed to dump trace: ${message}` }
  }
}
