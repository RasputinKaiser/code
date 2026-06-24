import { basename, dirname, sep as pathSep } from 'path'
import { getSessionId } from '../../bootstrap/state.js'
import { parseSkillFrontmatterFields } from '../../skills/loadSkillsDir.js'
import type { Command, PromptCommand } from '../../types/command.js'
import {
  extractDescriptionFromMarkdown,
  loadMarkdownFilesForSubdir,
  type MarkdownFile,
} from '../../utils/markdownConfigLoader.js'
import { executeShellCommandsInPrompt } from '../../utils/promptShellExecution.js'
import { substituteArguments } from '../../utils/argumentSubstitution.js'

export type WorkflowDefinition = {
  command: Command
  filePath: string
  baseDir: string
}

function isWorkflowEntrypoint(filePath: string): boolean {
  return /^workflow\.md$/i.test(basename(filePath))
}

function buildNamespace(targetDir: string, baseDir: string): string {
  const normalizedBaseDir = baseDir.endsWith(pathSep)
    ? baseDir.slice(0, -1)
    : baseDir

  if (targetDir === normalizedBaseDir) {
    return ''
  }

  const relativePath = targetDir.slice(normalizedBaseDir.length + 1)
  return relativePath ? relativePath.split(pathSep).join(':') : ''
}

function getWorkflowCommandName(file: MarkdownFile): string {
  if (isWorkflowEntrypoint(file.filePath)) {
    const workflowDir = dirname(file.filePath)
    const parentOfWorkflowDir = dirname(workflowDir)
    const commandBaseName = basename(workflowDir)
    const namespace = buildNamespace(parentOfWorkflowDir, file.baseDir)
    return namespace ? `${namespace}:${commandBaseName}` : commandBaseName
  }

  const fileDirectory = dirname(file.filePath)
  const commandBaseName = basename(file.filePath).replace(/\.md$/i, '')
  const namespace = buildNamespace(fileDirectory, file.baseDir)
  return namespace ? `${namespace}:${commandBaseName}` : commandBaseName
}

function createWorkflowPromptCommand({
  workflowName,
  displayName,
  description,
  hasUserSpecifiedDescription,
  markdownContent,
  allowedTools,
  argumentHint,
  argumentNames,
  whenToUse,
  version,
  model,
  disableModelInvocation,
  userInvocable,
  source,
  baseDir,
  hooks,
  executionContext,
  agent,
  effort,
  shell,
}: {
  workflowName: string
  displayName: string | undefined
  description: string
  hasUserSpecifiedDescription: boolean
  markdownContent: string
  allowedTools: string[]
  argumentHint: string | undefined
  argumentNames: string[]
  whenToUse: string | undefined
  version: string | undefined
  model: string | undefined
  disableModelInvocation: boolean
  userInvocable: boolean
  source: PromptCommand['source']
  baseDir: string
  hooks: PromptCommand['hooks']
  executionContext: 'inline' | 'fork' | undefined
  agent: string | undefined
  effort: PromptCommand['effort']
  shell: 'bash' | 'powershell' | undefined
}): Command {
  return {
    type: 'prompt',
    kind: 'workflow',
    name: workflowName,
    description,
    hasUserSpecifiedDescription,
    allowedTools,
    argumentHint,
    argNames: argumentNames.length > 0 ? argumentNames : undefined,
    whenToUse,
    version,
    model,
    disableModelInvocation,
    userInvocable,
    context: executionContext,
    agent,
    effort,
    contentLength: markdownContent.length,
    isHidden: !userInvocable,
    progressMessage: 'running workflow',
    userFacingName(): string {
      return displayName || workflowName
    },
    source,
    hooks,
    skillRoot: baseDir,
    async getPromptForCommand(args, toolUseContext) {
      let finalContent = `Base directory for this workflow: ${baseDir}\n\n${markdownContent}`

      finalContent = substituteArguments(
        finalContent,
        args,
        true,
        argumentNames,
      )

      finalContent = finalContent.replace(
        /\$\{CLAUDE_SESSION_ID\}/g,
        getSessionId(),
      )

      finalContent = await executeShellCommandsInPrompt(
        finalContent,
        {
          ...toolUseContext,
          getAppState() {
            const appState = toolUseContext.getAppState()
            return {
              ...appState,
              toolPermissionContext: {
                ...appState.toolPermissionContext,
                alwaysAllowRules: {
                  ...appState.toolPermissionContext.alwaysAllowRules,
                  command: allowedTools,
                },
              },
            }
          },
        },
        `/${workflowName}`,
        shell,
      )

      return [{ type: 'text', text: finalContent }]
    },
  } satisfies Command
}

export async function getWorkflowDefinitions(
  cwd: string,
): Promise<WorkflowDefinition[]> {
  const markdownFiles = await loadMarkdownFilesForSubdir('workflows', cwd)
  const workflows: WorkflowDefinition[] = []

  for (const file of markdownFiles) {
    const workflowName = getWorkflowCommandName(file)
    const baseDir = dirname(file.filePath)
    const parsed = parseSkillFrontmatterFields(
      file.frontmatter,
      file.content,
      workflowName,
      'Workflow',
    )

    const description =
      parsed.description ||
      extractDescriptionFromMarkdown(file.content, 'Workflow')

    workflows.push({
      command: createWorkflowPromptCommand({
        ...parsed,
        description,
        workflowName,
        markdownContent: file.content,
        source: file.source,
        baseDir,
      }),
      filePath: file.filePath,
      baseDir,
    })
  }

  return workflows
}

export async function getWorkflowCommands(cwd: string): Promise<Command[]> {
  const definitions = await getWorkflowDefinitions(cwd)
  return definitions.map(definition => definition.command)
}
