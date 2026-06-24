import type { Command, LocalCommandCall } from '../../types/command.js'
import { getCommandName } from '../../types/command.js'
import {
  getWorkflowDefinitions,
  type WorkflowDefinition,
} from '../../tools/WorkflowTool/createWorkflowCommand.js'
import { getCwd } from '../../utils/cwd.js'
import {
  getCanonicalNcodeConfigHomeDir,
  getLegacyClaudeConfigHomeDir,
} from '../../utils/envUtils.js'
import { getSettingSourceName } from '../../utils/settings/constants.js'

type WorkflowPromptCommand = Extract<Command, { type: 'prompt' }>

function formatWorkflowSummary(workflow: WorkflowPromptCommand): string {
  const argumentHint = workflow.argumentHint ? ` ${workflow.argumentHint}` : ''
  return `/${getCommandName(workflow)}${argumentHint} - ${workflow.description}`
}

function formatNoWorkflowsMessage(): string {
  return [
    'No workflow commands found.',
    '',
    'Workflow commands can be defined as markdown files in:',
    '- .ncode/workflows',
    '- .claude/workflows (legacy)',
    `- ${getCanonicalNcodeConfigHomeDir()}/workflows`,
    `- ${getLegacyClaudeConfigHomeDir()}/workflows (legacy)`,
  ].join('\n')
}

function formatWorkflowList(definitions: WorkflowDefinition[]): string {
  const lines = ['Available workflow commands:']

  for (const { command } of definitions) {
    if (command.type !== 'prompt') {
      continue
    }
    lines.push(`- ${formatWorkflowSummary(command)}`)
  }

  lines.push('', 'Use /workflows <name> to inspect a workflow.')
  return lines.join('\n')
}

function formatWorkflowDetail(definition: WorkflowDefinition): string {
  const { command, filePath, baseDir } = definition
  if (command.type !== 'prompt') {
    return `/${command.name} is not a workflow prompt command.`
  }

  const lines = [`/${command.name}`]
  const userFacingName = getCommandName(command)
  if (userFacingName !== command.name) {
    lines.push(`Display name: /${userFacingName}`)
  }

  lines.push(`Description: ${command.description}`)
  lines.push(`Source: ${getSettingSourceName(command.source)}`)
  lines.push(`File: ${filePath}`)
  lines.push(`Base directory: ${baseDir}`)

  if (command.argumentHint) {
    lines.push(`Arguments: ${command.argumentHint}`)
  }
  if (command.whenToUse) {
    lines.push(`When to use: ${command.whenToUse}`)
  }
  if (command.version) {
    lines.push(`Version: ${command.version}`)
  }
  if (command.model) {
    lines.push(`Model: ${command.model}`)
  }
  if (command.effort) {
    lines.push(`Effort: ${command.effort}`)
  }
  if (command.context === 'fork') {
    lines.push(
      command.agent
        ? `Context: fork · agent ${command.agent}`
        : 'Context: fork',
    )
  }

  return lines.join('\n')
}

function normalizeWorkflowQuery(args: string): string {
  return args.trim().replace(/^\/+/, '')
}

export const call: LocalCommandCall = async args => {
  const definitions = await getWorkflowDefinitions(getCwd())
  const workflows = definitions.filter(
    (
      definition,
    ): definition is WorkflowDefinition & { command: WorkflowPromptCommand } =>
      definition.command.type === 'prompt',
  )

  if (workflows.length === 0) {
    return { type: 'text', value: formatNoWorkflowsMessage() }
  }

  const query = normalizeWorkflowQuery(args)
  if (!query) {
    return { type: 'text', value: formatWorkflowList(workflows) }
  }

  const match = workflows.find(
    ({ command }) =>
      command.name === query || getCommandName(command) === query,
  )

  if (!match) {
    return {
      type: 'text',
      value: [
        `Workflow not found: ${query}`,
        '',
        formatWorkflowList(workflows),
      ].join('\n'),
    }
  }

  return { type: 'text', value: formatWorkflowDetail(match) }
}
