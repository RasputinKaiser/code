import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  countFilesRoundedRg,
  ripGrep,
  ripgrepCommand,
  resetRipgrepStateForTests,
} from './ripgrep.js'

const previousUseBuiltinRipgrep = process.env.USE_BUILTIN_RIPGREP

describe('ripgrep builtin runtime', () => {
  afterEach(() => {
    if (previousUseBuiltinRipgrep === undefined) {
      delete process.env.USE_BUILTIN_RIPGREP
    } else {
      process.env.USE_BUILTIN_RIPGREP = previousUseBuiltinRipgrep
    }
    resetRipgrepStateForTests()
  })

  it('uses the packaged builtin ripgrep binary when builtin mode is forced', async () => {
    process.env.USE_BUILTIN_RIPGREP = '1'
    resetRipgrepStateForTests()

    const fixtureDir = await mkdtemp(path.join(tmpdir(), 'ncode-ripgrep-test-'))
    try {
      const targetFile = path.join(fixtureDir, 'needle.txt')
      await writeFile(targetFile, 'hello\n', 'utf8')

      const { rgPath, rgArgs } = ripgrepCommand()
      expect(rgPath).not.toBe(process.execPath)
      expect(rgArgs).toEqual([])

      const files = await ripGrep(['--files'], fixtureDir, AbortSignal.timeout(5_000))
      expect(files).toContain(targetFile)
    } finally {
      await rm(fixtureDir, { recursive: true, force: true })
    }
  })

  it('counts files without throwing a path ReferenceError', async () => {
    process.env.USE_BUILTIN_RIPGREP = '1'
    resetRipgrepStateForTests()

    const fixtureDir = await mkdtemp(path.join(tmpdir(), 'ncode-ripgrep-count-'))
    try {
      await writeFile(path.join(fixtureDir, 'a.txt'), 'a\n', 'utf8')
      await writeFile(path.join(fixtureDir, 'b.txt'), 'b\n', 'utf8')

      const count = await countFilesRoundedRg(
        fixtureDir,
        AbortSignal.timeout(5_000),
        [],
      )
      expect(count).toBe(2)
    } finally {
      await rm(fixtureDir, { recursive: true, force: true })
    }
  })
})
