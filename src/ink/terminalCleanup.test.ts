import { afterEach, describe, expect, it } from 'bun:test'
import {
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
} from 'fs'
import { join } from 'path'
import { writeTerminalCleanup } from './terminalCleanup.js'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true })
  }
})

describe('writeTerminalCleanup', () => {
  it('writes to the configured stream when no tty fd exists', () => {
    let written = ''
    const stdout = {
      write(chunk: string) {
        written += chunk
        return true
      },
    }

    writeTerminalCleanup(stdout, '\u001b[?25h')

    expect(written).toBe('\u001b[?25h')
  })

  it('prefers the configured tty fd when one exists', () => {
    const tempRoot = join(process.cwd(), '.tmp')
    mkdirSync(tempRoot, { recursive: true })
    const dir = mkdtempSync(join(tempRoot, 'terminal-cleanup-'))
    tempDirs.push(dir)

    const outputPath = join(dir, 'cleanup.txt')
    const fd = openSync(outputPath, 'w')
    let streamWrites = 0

    try {
      writeTerminalCleanup(
        {
          fd,
          write() {
            streamWrites += 1
            return true
          },
        },
        '\u001b[?25l',
      )
    } finally {
      closeSync(fd)
    }

    expect(readFileSync(outputPath, 'utf8')).toBe('\u001b[?25l')
    expect(streamWrites).toBe(0)
  })
})
