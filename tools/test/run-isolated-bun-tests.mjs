#!/usr/bin/env bun
import { spawnSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      walk(path, out)
    } else if (/\.test\.[cm]?[jt]sx?$/.test(path)) {
      out.push(path.replace(/\\/g, '/'))
    }
  }
  return out
}

const args = process.argv.slice(2)
const testFiles = args.length > 0 ? args : walk('src').sort()
const bun = process.execPath
const failures = []
const started = Date.now()
const needsCompiledBinary = testFiles.some(file =>
  /(?:compiledBinaryPty|wrapperPty|wrapperTmux)/.test(file),
)

if (needsCompiledBinary && !process.env.NCODE_TEST_COMPILED_BINARY) {
  process.stdout.write('Building native test binary for wrapper/compiled-binary tests...\\n')
  const build = spawnSync(bun, [
    'build/package.mjs',
    '--build-mode',
    'external',
    '--skip-archive',
  ], {
    stdio: 'inherit',
    env: { ...process.env },
  })
  if (build.status !== 0) {
    process.exit(build.status ?? 1)
  }
}

for (let index = 0; index < testFiles.length; index += 1) {
  const file = testFiles[index]
  process.stdout.write(`[${String(index + 1).padStart(3, '0')}/${String(testFiles.length).padStart(3, '0')}] ${file}\n`)
  const result = spawnSync(bun, ['test', file], {
    stdio: 'inherit',
    env: { ...process.env },
  })
  if (result.status !== 0) {
    failures.push({ file, status: result.status ?? 1 })
  }
}

const elapsed = ((Date.now() - started) / 1000).toFixed(1)
if (failures.length > 0) {
  process.stderr.write(`\n${failures.length} isolated Bun test file(s) failed after ${elapsed}s:\n`)
  for (const failure of failures) {
    process.stderr.write(`- ${failure.file} (exit ${failure.status})\n`)
  }
  process.exit(1)
}

process.stdout.write(`\nAll ${testFiles.length} isolated Bun test files passed in ${elapsed}s.\n`)
