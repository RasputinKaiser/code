import { afterEach, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, relative } from 'path'
import { getEmptyToolPermissionContext } from '../Tool.js'
import { glob } from './glob.js'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function makeTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ncode-glob-test-'))
  tempRoots.push(root)
  return root
}

function relativePosix(root: string, filePath: string): string {
  return relative(root, filePath).replaceAll('\\', '/')
}

test('glob supports relative directory patterns like code/*/', async () => {
  const root = makeTempRoot()
  mkdirSync(join(root, 'code', 'src'), { recursive: true })
  mkdirSync(join(root, 'code', 'tests'), { recursive: true })
  mkdirSync(join(root, 'docs', 'guides'), { recursive: true })

  const { files, truncated } = await glob(
    'code/*/',
    root,
    { limit: 100, offset: 0 },
    new AbortController().signal,
    getEmptyToolPermissionContext(),
  )

  expect(truncated).toBe(false)
  expect(files.map(file => relativePosix(root, file)).sort()).toEqual([
    'code/src',
    'code/tests',
  ])
})

test('glob supports nested directory patterns', async () => {
  const root = makeTempRoot()
  mkdirSync(join(root, 'code', 'src', 'utils'), { recursive: true })
  mkdirSync(join(root, 'code', 'src', 'tools'), { recursive: true })
  mkdirSync(join(root, 'code', 'tests', 'utils'), { recursive: true })

  const { files } = await glob(
    'code/**/utils/',
    root,
    { limit: 100, offset: 0 },
    new AbortController().signal,
    getEmptyToolPermissionContext(),
  )

  expect(files.map(file => relativePosix(root, file)).sort()).toEqual([
    'code/src/utils',
    'code/tests/utils',
  ])
})

test('glob narrows relative file patterns with a static base directory', async () => {
  const root = makeTempRoot()
  mkdirSync(join(root, 'code'), { recursive: true })
  mkdirSync(join(root, 'docs'), { recursive: true })
  writeFileSync(join(root, 'code', 'main.ts'), 'export const main = true\n')
  writeFileSync(join(root, 'docs', 'main.ts'), 'export const docs = true\n')

  const { files, truncated } = await glob(
    'code/*.ts',
    root,
    { limit: 100, offset: 0 },
    new AbortController().signal,
    getEmptyToolPermissionContext(),
  )

  expect(truncated).toBe(false)
  expect(files.map(file => relativePosix(root, file))).toEqual(['code/main.ts'])
})

test('glob supports recursive literal directory-name patterns without trailing slash', async () => {
  const root = makeTempRoot()
  mkdirSync(join(root, 'code', 'src'), { recursive: true })
  mkdirSync(join(root, 'packages', 'cli', 'code'), { recursive: true })
  writeFileSync(join(root, 'packages', 'cli', 'code', 'index.ts'), 'export {}\n')

  const { files, truncated } = await glob(
    '**/code',
    root,
    { limit: 100, offset: 0 },
    new AbortController().signal,
    getEmptyToolPermissionContext(),
  )

  expect(truncated).toBe(false)
  expect(files.map(file => relativePosix(root, file)).sort()).toEqual([
    'code',
    'packages/cli/code',
  ])
})

test('glob falls back to file matching when recursive literal patterns do not match directories', async () => {
  const root = makeTempRoot()
  mkdirSync(join(root, 'code'), { recursive: true })
  writeFileSync(join(root, 'code', 'LICENSE'), 'ok\n')
  writeFileSync(join(root, 'LICENSE'), 'ok\n')

  const { files, truncated } = await glob(
    '**/LICENSE',
    root,
    { limit: 100, offset: 0 },
    new AbortController().signal,
    getEmptyToolPermissionContext(),
  )

  expect(truncated).toBe(false)
  expect(files.map(file => relativePosix(root, file)).sort()).toEqual([
    'LICENSE',
    'code/LICENSE',
  ])
})
