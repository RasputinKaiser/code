import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { call } from './workflows.js'
import {
  getCwdState,
  getOriginalCwd,
  setCwdState,
  setOriginalCwd,
} from '../../bootstrap/state.js'
import { loadMarkdownFilesForSubdir } from '../../utils/markdownConfigLoader.js'

const originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR
const originalNcodeConfigDir = process.env.NCODE_CONFIG_DIR
const originalNativeSearch = process.env.CLAUDE_CODE_USE_NATIVE_FILE_SEARCH
const originalCwd = process.cwd()
const originalBootstrapCwd = getCwdState()
const originalBootstrapOriginalCwd = getOriginalCwd()

let projectDir: string
let configDir: string

function clearWorkflowCaches(): void {
  ;(loadMarkdownFilesForSubdir as { cache?: { clear?: () => void } }).cache
    ?.clear?.()
}

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), 'ncode-workflows-command-'))
  configDir = await mkdtemp(join(tmpdir(), 'ncode-workflows-config-'))
  process.env.CLAUDE_CONFIG_DIR = configDir
  process.env.NCODE_CONFIG_DIR = configDir
  process.env.CLAUDE_CODE_USE_NATIVE_FILE_SEARCH = 'true'
  await mkdir(join(projectDir, '.git'), { recursive: true })
  process.chdir(projectDir)
  setOriginalCwd(projectDir)
  setCwdState(projectDir)
  clearWorkflowCaches()
})

afterEach(async () => {
  process.chdir(originalCwd)
  setOriginalCwd(originalBootstrapOriginalCwd)
  setCwdState(originalBootstrapCwd)
  clearWorkflowCaches()
  if (originalClaudeConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir
  }
  if (originalNcodeConfigDir === undefined) {
    delete process.env.NCODE_CONFIG_DIR
  } else {
    process.env.NCODE_CONFIG_DIR = originalNcodeConfigDir
  }
  if (originalNativeSearch === undefined) {
    delete process.env.CLAUDE_CODE_USE_NATIVE_FILE_SEARCH
  } else {
    process.env.CLAUDE_CODE_USE_NATIVE_FILE_SEARCH = originalNativeSearch
  }
  await rm(projectDir, { recursive: true, force: true })
  await rm(configDir, { recursive: true, force: true })
})

describe('/workflows command', () => {
  it('shows creation guidance when no workflows are defined', async () => {
    await expect(call('', {} as never)).resolves.toEqual({
      type: 'text',
      value: [
        'No workflow commands found.',
        '',
        'Workflow commands can be defined as markdown files in:',
        '- .ncode/workflows',
        '- .claude/workflows (legacy)',
        `- ${configDir}/workflows`,
        `- ${configDir}/workflows (legacy)`,
      ].join('\n'),
    })
  })

  it('lists and inspects discovered workflows', async () => {
    const workflowsDir = join(projectDir, '.ncode', 'workflows')
    await mkdir(workflowsDir, { recursive: true })
    await writeFile(
      join(workflowsDir, 'spec.md'),
      [
        '---',
        'description: Generate a spec',
        'argument-hint: "<target>"',
        'when_to_use: Use when you need a focused spec workflow',
        '---',
        'Draft a spec.',
      ].join('\n'),
    )
    clearWorkflowCaches()

    await expect(call('', {} as never)).resolves.toEqual({
      type: 'text',
      value: [
        'Available workflow commands:',
        '- /spec <target> - Generate a spec',
        '',
        'Use /workflows <name> to inspect a workflow.',
      ].join('\n'),
    })

    await expect(call('spec', {} as never)).resolves.toEqual({
      type: 'text',
      value: [
        '/spec',
        'Description: Generate a spec',
        'Source: project',
        `File: ${join(workflowsDir, 'spec.md')}`,
        `Base directory: ${workflowsDir}`,
        'Arguments: <target>',
        'When to use: Use when you need a focused spec workflow',
      ].join('\n'),
    })
  })
})
