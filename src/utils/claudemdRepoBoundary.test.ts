import { describe, expect, it } from 'bun:test'
import { dirname, join } from 'node:path'

const BUN_BIN = Bun.which('bun') ?? process.execPath
const CODE_ROOT = join(import.meta.dir, '../..')
const MONOREPO_ROOT = CODE_ROOT
const PARENT_ROOT = dirname(CODE_ROOT)

type ProjectMemoryProbeEntry = {
  path: string
  content: string
}

function probeProjectMemoryFiles(originalCwd: string): ProjectMemoryProbeEntry[] {
  const script = [
    'process.env.NCODE_BUILD_MODE = "noumena";',
    `const { setOriginalCwd } = await import(${JSON.stringify('./src/bootstrap/state.js')});`,
    `const { getMemoryFiles } = await import(${JSON.stringify('./src/utils/claudemd.js')});`,
    `setOriginalCwd(${JSON.stringify(originalCwd)});`,
    'const files = await getMemoryFiles();',
    'const projectFiles = files.filter(file => file.type === "Project").map(file => ({ path: file.path, content: file.content }));',
    'console.log(JSON.stringify(projectFiles));',
  ].join('\n')

  const result = Bun.spawnSync({
    cmd: [BUN_BIN, '-e', script],
    cwd: CODE_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  })

  expect(result.exitCode).toBe(0)
  return JSON.parse(result.stdout.toString()) as ProjectMemoryProbeEntry[]
}

describe('claudemd project memory repo boundary', () => {
  it('stops loading project instructions at the repo root', () => {
    const projectFiles = probeProjectMemoryFiles(CODE_ROOT)
    const projectPaths = projectFiles.map(file => file.path)

    expect(projectPaths).not.toContain(join(MONOREPO_ROOT, 'CLAUDE.md'))
    expect(projectPaths).not.toContain(join(PARENT_ROOT, 'AGENTS.md'))
    if (projectFiles[0]) {
      expect(projectFiles[0].content).not.toContain('sl root')
      expect(projectFiles[0].content).not.toContain('sl status')
    }
  })
})
