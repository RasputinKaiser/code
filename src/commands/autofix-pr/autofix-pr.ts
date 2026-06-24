import type { LocalJSXCommandCall } from '../../types/command.js'
import { errorMessage } from '../../utils/errors.js'
import { execFileNoThrow } from '../../utils/execFileNoThrow.js'
import { jsonParse } from '../../utils/slowOperations.js'
import { getTaskOutputPath } from '../../utils/task/diskOutput.js'
import { teleportToRemote } from '../../utils/teleport.js'
import {
  checkRemoteAgentEligibility,
  formatPreconditionError,
  getRemoteTaskSessionUrl,
  registerRemoteAgentTask,
} from '../../tasks/RemoteAgentTask/RemoteAgentTask.js'

export type AutofixPrTarget = {
  owner: string
  repo: string
  number: number
  url: string
  headRefName: string
}

type GitHubPrView = {
  number?: unknown
  url?: unknown
  headRefName?: unknown
  headRepository?: unknown
  headRepositoryOwner?: unknown
  state?: unknown
}

const GH_FIELDS =
  'number,url,headRefName,headRepository,headRepositoryOwner,state'
const GH_TIMEOUT_MS = 5000

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function readOwner(value: unknown): string | null {
  const direct = readString(value)
  if (direct) return direct
  if (!value || typeof value !== 'object') return null

  const login = readString((value as { login?: unknown }).login)
  if (login) return login

  return readString((value as { name?: unknown }).name)
}

function readRepo(value: unknown): string | null {
  const direct = readString(value)
  if (direct) {
    const slash = direct.lastIndexOf('/')
    return slash >= 0 ? direct.slice(slash + 1) : direct
  }
  if (!value || typeof value !== 'object') return null

  const name = readString((value as { name?: unknown }).name)
  if (name) return name

  const withOwner = readString(
    (value as { nameWithOwner?: unknown }).nameWithOwner,
  )
  if (!withOwner) return null
  const slash = withOwner.lastIndexOf('/')
  return slash >= 0 ? withOwner.slice(slash + 1) : withOwner
}

export async function detectCurrentAutofixPr(): Promise<AutofixPrTarget | null> {
  const { stdout, code } = await execFileNoThrow(
    'gh',
    ['pr', 'view', '--json', GH_FIELDS],
    {
      preserveOutputOnError: false,
      timeout: GH_TIMEOUT_MS,
    },
  )

  if (code !== 0 || !stdout.trim()) {
    return null
  }

  let parsed: GitHubPrView
  try {
    parsed = jsonParse(stdout) as GitHubPrView
  } catch {
    return null
  }

  const number = typeof parsed.number === 'number' ? parsed.number : null
  const url = readString(parsed.url)
  const headRefName = readString(parsed.headRefName)
  const owner = readOwner(parsed.headRepositoryOwner)
  const repo = readRepo(parsed.headRepository)
  const state = readString(parsed.state)

  if (
    number === null ||
    !url ||
    !headRefName ||
    !owner ||
    !repo ||
    !state ||
    state === 'MERGED' ||
    state === 'CLOSED'
  ) {
    return null
  }

  return {
    owner,
    repo,
    number,
    url,
    headRefName,
  }
}

export function buildAutofixPrPrompt(
  target: AutofixPrTarget,
  userPrompt?: string,
): string {
  const lines = [
    `You are running in PR autofix mode for GitHub pull request ${target.owner}/${target.repo}#${target.number}.`,
    '',
    'This is a long-lived background session.',
    'Continuously monitor the PR for:',
    '- failing CI or status checks',
    '- reviewer comments or requested changes',
    '',
    'When new failures or review comments appear:',
    '1. Inspect the failing checks or review feedback.',
    '2. Make the smallest correct fix on the PR head branch.',
    '3. Push commits directly back to that same branch.',
    '4. Continue monitoring until the session is explicitly stopped.',
    '',
    `Work only on the PR head branch: ${target.headRefName}.`,
    'Do not create a new branch or a new pull request.',
    'If there is nothing new to fix yet, stay idle and keep monitoring.',
  ]

  const trimmedPrompt = userPrompt?.trim()
  if (!trimmedPrompt) {
    return lines.join('\n')
  }

  return `${lines.join('\n')}\n\nAdditional instructions from user:\n${trimmedPrompt}`
}

export async function launchAutofixPr(
  args: string,
  context: Parameters<LocalJSXCommandCall>[1],
): Promise<{
  taskId: string
  sessionUrl: string
  outputFile: string
  target: AutofixPrTarget
}> {
  const target = await detectCurrentAutofixPr()
  if (!target) {
    throw new Error(
      'No open pull request is associated with the current branch. Push the branch and create a PR before running /autofix-pr.',
    )
  }

  const eligibility = await checkRemoteAgentEligibility({
    skipBundle: true,
    requireGitRemote: true,
  })
  if (!eligibility.eligible) {
    const reasons = eligibility.errors.map(formatPreconditionError).join('\n')
    throw new Error(`Cannot launch /autofix-pr:\n${reasons}`)
  }

  const description = `autofix-pr: ${target.owner}/${target.repo}#${target.number}`
  const session = await teleportToRemote({
    initialMessage: buildAutofixPrPrompt(target, args),
    description,
    signal: context.abortController.signal,
    branchName: target.headRefName,
    skipBundle: true,
    reuseOutcomeBranch: target.headRefName,
    githubPr: {
      owner: target.owner,
      repo: target.repo,
      number: target.number,
    },
  })

  if (!session) {
    throw new Error('Failed to create remote autofix session.')
  }

  const command = args.trim() ? `/autofix-pr ${args.trim()}` : '/autofix-pr'
  const { taskId, sessionId } = registerRemoteAgentTask({
    remoteTaskType: 'autofix-pr',
    session: {
      id: session.id,
      title: session.title || description,
    },
    command,
    context,
    toolUseId: context.toolUseId,
    isLongRunning: true,
    remoteTaskMetadata: {
      owner: target.owner,
      repo: target.repo,
      prNumber: target.number,
    },
  })

  return {
    taskId,
    sessionUrl: getRemoteTaskSessionUrl(sessionId),
    outputFile: getTaskOutputPath(taskId),
    target,
  }
}

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  try {
    const launched = await launchAutofixPr(args, context)
    onDone(
      `Autofix PR launched in CCR.\n` +
        `taskId: ${launched.taskId}\n` +
        `session_url: ${launched.sessionUrl}\n` +
        `output_file: ${launched.outputFile}\n` +
        `Watching ${launched.target.owner}/${launched.target.repo}#${launched.target.number} for CI failures or review comments.`,
      {
        display: 'system',
      },
    )
  } catch (error) {
    onDone(`Autofix PR launch failed: ${errorMessage(error)}`, {
      display: 'system',
    })
  }

  return null
}
