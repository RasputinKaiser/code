import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  getWorkflowDefinitions,
  getWorkflowCommands,
} from './createWorkflowCommand.js'
import { loadMarkdownFilesForSubdir } from '../../utils/markdownConfigLoader.js'

const originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR
const originalNcodeConfigDir = process.env.NCODE_CONFIG_DIR
const originalNativeSearch = process.env.CLAUDE_CODE_USE_NATIVE_FILE_SEARCH

let projectDir: string
let configDir: string

function clearWorkflowCaches(): void {
  ;(loadMarkdownFilesForSubdir as { cache?: { clear?: () => void } }).cache
    ?.clear?.()
}

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), 'ncode-workflows-project-'))
  configDir = await mkdtemp(join(tmpdir(), 'ncode-workflows-config-'))
  process.env.CLAUDE_CONFIG_DIR = configDir
  process.env.NCODE_CONFIG_DIR = configDir
  process.env.CLAUDE_CODE_USE_NATIVE_FILE_SEARCH = 'true'
  await mkdir(join(projectDir, '.git'), { recursive: true })
  clearWorkflowCaches()
})

afterEach(async () => {
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

describe('workflow command loader', () => {
  it('loads markdown workflows as prompt commands', async () => {
    const workflowsDir = join(projectDir, '.ncode', 'workflows')
    await mkdir(workflowsDir, { recursive: true })
    await writeFile(
      join(workflowsDir, 'spec.md'),
      [
        '---',
        'description: Generate a spec',
        'argument-hint: "<target>"',
        'arguments: "target"',
        'when_to_use: Use when you need a focused spec workflow',
        'context: fork',
        'agent: general-purpose',
        'effort: high',
        '---',
        'Draft a spec for $target.',
      ].join('\n'),
    )

    const definitions = await getWorkflowDefinitions(projectDir)
    expect(definitions).toHaveLength(1)

    const workflow = definitions[0]
    expect(workflow).toBeDefined()
    expect(workflow?.filePath).toBe(join(workflowsDir, 'spec.md'))
    expect(workflow?.baseDir).toBe(workflowsDir)
    expect(workflow?.command).toMatchObject({
      type: 'prompt',
      kind: 'workflow',
      name: 'spec',
      description: 'Generate a spec',
      argumentHint: '<target>',
      whenToUse: 'Use when you need a focused spec workflow',
      context: 'fork',
      agent: 'general-purpose',
      effort: 'high',
      source: 'projectSettings',
      progressMessage: 'running workflow',
    })

    if (workflow?.command.type !== 'prompt') {
      throw new Error('expected prompt workflow')
    }

    await expect(
      workflow.command.getPromptForCommand('auth', {} as never),
    ).resolves.toEqual([
      {
        type: 'text',
        text: `Base directory for this workflow: ${workflowsDir}\n\nDraft a spec for auth.`,
      },
    ])
  })

  it('supports WORKFLOW.md directory entrypoints with namespacing', async () => {
    const workflowDir = join(projectDir, '.ncode', 'workflows', 'release')
    await mkdir(workflowDir, { recursive: true })
    await writeFile(
      join(workflowDir, 'WORKFLOW.md'),
      ['---', 'description: Release workflow', '---', 'Prepare release cut.'].join('\n'),
    )

    const commands = await getWorkflowCommands(projectDir)
    expect(commands).toHaveLength(1)
    expect(commands[0]).toMatchObject({
      type: 'prompt',
      kind: 'workflow',
      name: 'release',
      description: 'Release workflow',
    })
  })
})
