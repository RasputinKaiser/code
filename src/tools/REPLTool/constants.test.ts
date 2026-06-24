import { describe, expect, it } from 'bun:test'
import { join } from 'node:path'

const BUN_BIN = Bun.which('bun') ?? process.execPath
const CODE_ROOT = join(import.meta.dir, '../../..')

function probeToolNames(env: Record<string, string | undefined>): string[] {
  const script = [
    'process.env.NCODE_BUILD_MODE = "noumena";',
    'process.env.CLAUDE_CODE_ENTRYPOINT = "cli";',
    'delete process.env.NCODE_REPL;',
    'delete process.env.CLAUDE_CODE_REPL;',
    'delete process.env.CLAUDE_REPL_MODE;',
    'delete process.env.NCODE_JS_REPL;',
    'delete process.env.CLAUDE_CODE_JS_REPL;',
    'delete process.env.NCODE_PY_REPL;',
    'delete process.env.CLAUDE_CODE_PY_REPL;',
    ...Object.entries(env).map(([key, value]) =>
      value === undefined
        ? `delete process.env.${key};`
        : `process.env.${key} = ${JSON.stringify(value)};`,
    ),
    'const { getTools } = await import("./src/tools.js");',
    'const { getEmptyToolPermissionContext } = await import("./src/Tool.js");',
    'console.log(JSON.stringify(getTools(getEmptyToolPermissionContext()).map(tool => tool.name)));',
  ].join('\n')

  const result = Bun.spawnSync({
    cmd: [BUN_BIN, '-e', script],
    cwd: CODE_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
    env: process.env,
  })

  expect(result.exitCode).toBe(0)
  return JSON.parse(result.stdout.toString()) as string[]
}

describe('REPL mode tool surface', () => {
  it('keeps the interactive cli on the direct tool path by default', () => {
    const toolNames = probeToolNames({})
    expect(toolNames).toContain('Bash')
    expect(toolNames).toContain('Read')
    expect(toolNames).toContain('Glob')
    expect(toolNames).toContain('Grep')
    expect(toolNames).not.toContain('REPL')
    expect(toolNames.indexOf('Bash')).toBeLessThan(toolNames.indexOf('Glob'))
    expect(toolNames.indexOf('Bash')).toBeLessThan(toolNames.indexOf('Grep'))
    expect(toolNames.indexOf('Read')).toBeGreaterThan(toolNames.indexOf('Bash'))
  })

  it('only exposes REPL when explicitly opted in', () => {
    const toolNames = probeToolNames({
      NCODE_REPL: '1',
    })
    expect(toolNames).toContain('REPL')
    expect(toolNames).toContain('Bash')
    expect(toolNames).toContain('Read')
    expect(toolNames).toContain('Glob')
    expect(toolNames).toContain('Grep')
    expect(toolNames.indexOf('Glob')).toBeLessThan(toolNames.indexOf('REPL'))
    expect(toolNames.indexOf('Grep')).toBeLessThan(toolNames.indexOf('REPL'))
    expect(toolNames.indexOf('Read')).toBeLessThan(toolNames.indexOf('REPL'))
    expect(toolNames.indexOf('Bash')).toBeLessThan(toolNames.indexOf('REPL'))
  })

  it('exposes js_repl without hiding the direct tool surface', () => {
    const toolNames = probeToolNames({
      NCODE_JS_REPL: '1',
    })
    expect(toolNames).toContain('js_repl')
    expect(toolNames).toContain('js_repl_reset')
    expect(toolNames).toContain('Bash')
    expect(toolNames).toContain('Read')
    expect(toolNames).toContain('Glob')
    expect(toolNames).toContain('Grep')
  })

  it('does not expose py_repl in the OSS export even with env opt-in', () => {
    const toolNames = probeToolNames({
      NCODE_PY_REPL: '1',
    })
    expect(toolNames).not.toContain('py_repl')
    expect(toolNames).not.toContain('py_repl_reset')
    expect(toolNames).toContain('Bash')
    expect(toolNames).toContain('Read')
    expect(toolNames).toContain('Glob')
    expect(toolNames).toContain('Grep')
  })

  it('exposes REPL-family tools for sdk-cli when explicitly opted in', () => {
    const toolNames = probeToolNames({
      CLAUDE_CODE_ENTRYPOINT: 'sdk-cli',
      NCODE_REPL: '1',
      NCODE_JS_REPL: '1',
      NCODE_PY_REPL: '1',
    })
    expect(toolNames).toContain('Bash')
    expect(toolNames).toContain('Read')
    expect(toolNames).toContain('REPL')
    expect(toolNames).toContain('js_repl')
    expect(toolNames).toContain('js_repl_reset')
    expect(toolNames).not.toContain('py_repl')
    expect(toolNames).not.toContain('py_repl_reset')
  })
})
