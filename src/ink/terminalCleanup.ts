import { writeSync } from 'fs'

type CleanupStream = Pick<NodeJS.WriteStream, 'write'> & {
  fd?: number | null
}

export function writeTerminalCleanup(
  stdout: CleanupStream,
  content: string,
): void {
  const fd = stdout.fd
  if (typeof fd === 'number' && Number.isInteger(fd) && fd >= 0) {
    writeSync(fd, content)
    return
  }

  stdout.write(content)
}
