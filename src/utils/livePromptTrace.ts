import { appendFileSync } from 'fs'

function getTraceFile(): string | undefined {
  return process.env.NCODE_LIVE_TRACE_FILE
}

export function recordLivePromptTrace(
  kind: string,
  data: Record<string, unknown> = {},
): void {
  const traceFile = getTraceFile()
  if (!traceFile) return
  try {
    appendFileSync(
      traceFile,
      `${JSON.stringify({
        ts: Date.now(),
        kind,
        ...data,
      })}\n`,
      'utf8',
    )
  } catch {
    // Debug-only trace hook. Never interfere with the live app.
  }
}
