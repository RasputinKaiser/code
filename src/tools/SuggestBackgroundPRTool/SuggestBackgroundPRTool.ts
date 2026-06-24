import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import {
  checkRemoteAgentEligibility,
  formatPreconditionError,
  getRemoteTaskSessionUrl,
  registerRemoteAgentTask,
} from '../../tasks/RemoteAgentTask/RemoteAgentTask.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { getTaskOutputPath } from '../../utils/task/diskOutput.js'
import { teleportToRemote } from '../../utils/teleport.js'

const SUGGEST_BACKGROUND_PR_TOOL_NAME = 'SuggestBackgroundPR'

const DESCRIPTION =
  'Launch a remote NCode session to draft or update a pull request in the background.'

const PROMPT = `Use this tool to launch a cloud/background PR task that runs in NCode on the web.

Provide:
- description: short human-readable title of what PR work should happen
- prompt: exact instructions for the remote session
- branch_name (optional): explicit git ref/branch to launch from
- use_bundle (optional, default true): include local workspace snapshot

This tool should be used when the user wants async PR-oriented work that should continue in the background.`

const inputSchema = lazySchema(() =>
  z.strictObject({
    description: z
      .string()
      .min(1)
      .describe('Short title for the background PR task'),
    prompt: z
      .string()
      .min(1)
      .describe('Full instruction prompt for the remote PR task'),
    branch_name: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Optional branch/ref to launch from (for example: "main" or "refs/pull/123/head")',
      ),
    use_bundle: z
      .boolean()
      .optional()
      .default(true)
      .describe(
        'If true, include a bundled workspace snapshot so unpushed/local changes are available remotely',
      ),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    status: z.literal('remote_launched'),
    taskId: z.string(),
    sessionUrl: z.string(),
    description: z.string(),
    prompt: z.string(),
    outputFile: z.string(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>
type Output = z.infer<OutputSchema>

type LaunchSuggestBackgroundPRParams = {
  description: string
  prompt: string
  branch_name?: string
  use_bundle?: boolean
  toolUseContext: Parameters<
    ToolDef<InputSchema, Output>['call']
  >[1]
}

export async function launchSuggestBackgroundPRTask({
  description,
  prompt,
  branch_name,
  use_bundle = true,
  toolUseContext,
}: LaunchSuggestBackgroundPRParams): Promise<Output> {
  const eligibility = await checkRemoteAgentEligibility({
    skipBundle: use_bundle === false,
  })
  if (!eligibility.eligible) {
    const reasons = eligibility.errors.map(formatPreconditionError).join('\n')
    throw new Error(`Cannot launch background PR task:\n${reasons}`)
  }

  let bundleFailHint: string | undefined
  const session = await teleportToRemote({
    initialMessage: prompt,
    description,
    signal: toolUseContext.abortController.signal,
    branchName: branch_name,
    useBundle: use_bundle,
    onBundleFail: msg => {
      bundleFailHint = msg
    },
  })
  if (!session) {
    throw new Error(bundleFailHint ?? 'Failed to create remote session')
  }

  const { taskId, sessionId } = registerRemoteAgentTask({
    remoteTaskType: 'background-pr',
    session: {
      id: session.id,
      title: session.title || description,
    },
    command: prompt,
    context: toolUseContext,
    toolUseId: toolUseContext.toolUseId,
  })

  return {
    status: 'remote_launched',
    taskId,
    sessionUrl: getRemoteTaskSessionUrl(sessionId),
    description,
    prompt,
    outputFile: getTaskOutputPath(taskId),
  }
}

export const SuggestBackgroundPRTool = buildTool({
  name: SUGGEST_BACKGROUND_PR_TOOL_NAME,
  searchHint: 'launch a background cloud task to work on a pull request',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return PROMPT
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return false
  },
  toAutoClassifierInput(input) {
    return `${input.description}\n${input.prompt}`
  },
  renderToolUseMessage() {
    return null
  },
  async call(
    { description, prompt, branch_name, use_bundle = true },
    toolUseContext,
  ) {
    const data = await launchSuggestBackgroundPRTask({
      description,
      prompt,
      branch_name,
      use_bundle,
      toolUseContext,
    })

    return {
      data,
    }
  },
  mapToolResultToToolResultBlockParam(result, toolUseID) {
    const data = result as Output
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: [
        {
          type: 'text',
          text: `Background PR task launched in CCR.
taskId: ${data.taskId}
session_url: ${data.sessionUrl}
output_file: ${data.outputFile}
The task is running remotely and you will be notified when it completes.
Briefly tell the user what you launched and end your response.`,
        },
      ],
    }
  },
} satisfies ToolDef<InputSchema, Output>)
