import { describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, writeFile } from 'fs/promises'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { getCronFilePath, readCronTasks, writeCronTasks } from './cronTasks.js'

describe('cronTasks canonical path behavior', () => {
  test('returns canonical .ncode path by default', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ncode-cron-path-'))
    expect(getCronFilePath(root)).toBe(join(root, '.ncode', 'scheduled_tasks.json'))
  })

  test('reads legacy .claude scheduled tasks when canonical file is absent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ncode-cron-legacy-'))
    const legacyDir = join(root, '.claude')
    await mkdir(legacyDir, { recursive: true })
    await writeFile(
      join(legacyDir, 'scheduled_tasks.json'),
      JSON.stringify({
        tasks: [
          {
            id: 'abc12345',
            cron: '7 * * * *',
            prompt: 'hello',
            createdAt: 123,
          },
        ],
      }),
      'utf-8',
    )

    const tasks = await readCronTasks(root)
    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.id).toBe('abc12345')
  })

  test('writes canonical .ncode scheduled tasks file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ncode-cron-write-'))
    await writeCronTasks(
      [{ id: 'abc12345', cron: '7 * * * *', prompt: 'hello', createdAt: 123 }],
      root,
    )

    const canonicalPath = join(root, '.ncode', 'scheduled_tasks.json')
    expect(existsSync(canonicalPath)).toBe(true)
    expect(readFileSync(canonicalPath, 'utf-8')).toContain('"id": "abc12345"')
  })
})
