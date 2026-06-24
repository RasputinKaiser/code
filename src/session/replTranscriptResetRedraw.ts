import instances from '../ink/instances.js'

export function requestReplTranscriptResetRedraw(
  stdout: NodeJS.WriteStream = process.stdout,
): void {
  instances.get(stdout)?.forceRedraw({ clearBeforePaint: true })
}
