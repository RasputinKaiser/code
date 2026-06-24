import type { Command } from '../commands.js'
import { getAttributionTexts } from '../utils/attribution.js'
import { getIsGit, getIsSl } from '../utils/git.js'
import { executeShellCommandsInPrompt } from '../utils/promptShellExecution.js'
import { getUndercoverInstructions, isUndercover } from '../utils/undercover.js'
import { isInternalBuild } from 'src/capabilities/static.js'

const ALLOWED_TOOLS = [
  'Bash(git add:*)',
  'Bash(git status:*)',
  'Bash(git diff:*)',
  'Bash(git branch:*)',
  'Bash(git log:*)',
  'Bash(git commit:*)',
  'Bash(sl add:*)',
  'Bash(sl status:*)',
  'Bash(sl diff:*)',
  'Bash(sl book:*)',
  'Bash(sl smartlog:*)',
  'Bash(sl log:*)',
  'Bash(sl commit:*)',
]

function getPromptContent(repoType: 'git' | 'sl'): string {
  const { commit: commitAttribution } = getAttributionTexts()

  let prefix = ''
  if (isInternalBuild() && isUndercover()) {
    prefix = getUndercoverInstructions() + '\n'
  }

  const isGit = repoType === 'git'
  const statusCmd = isGit ? 'git status' : 'sl status'
  const diffCmd = isGit ? 'git diff HEAD' : 'sl diff'
  const branchCmd = isGit ? 'git branch --show-current' : 'sl book'
  const logCmd = isGit ? 'git log --oneline -10' : `sl log -l 10 -T '{node|short} {desc|firstline}'`
  const overviewCmd = isGit ? logCmd : 'sl smartlog'
  const overviewLabel = isGit ? 'Recent commits' : 'Commit graph'
  const extraLogLine = isGit ? '' : `\n- Recent commits: !\`${logCmd}\``
  const scmSafety = isGit ? 'Git Safety Protocol' : 'Sl Safety Protocol'
  const configWarning = isGit ? 'NEVER update the git config' : 'NEVER update the sl config'
  const amendWarning = isGit ? 'NEVER use git commit --amend' : 'NEVER use sl commit --amend'
  const interactiveWarning = isGit
    ? 'Never use git commands with the -i flag (like git rebase -i or git add -i) since they require interactive input which is not supported'
    : 'Never use sl commands with the -i flag (like sl rebase -i or sl add -i) since they require interactive input which is not supported'
  const commitCmd = isGit ? 'git commit' : 'sl commit'
  const stageInstruction = isGit
    ? 'Stage relevant files and create the commit using HEREDOC syntax:'
    : 'Sapling has no staging area — all modifications to tracked files are automatically included by `sl commit`. Only use `sl add` for previously untracked files. Create the commit using HEREDOC syntax:'

  return `${prefix}## Context

- Current ${repoType} status: !\`${statusCmd}\`
- Current ${repoType} diff: !\`${diffCmd}\`
- Current ${isGit ? 'branch' : 'bookmark'}: !\`${branchCmd}\`
- ${overviewLabel}: !\`${overviewCmd}\`${extraLogLine}

## ${scmSafety}

- ${configWarning}
- NEVER skip hooks (--no-verify, --no-gpg-sign, etc) unless the user explicitly requests it
- CRITICAL: ALWAYS create NEW commits. ${amendWarning}, unless the user explicitly requests it
- Do not commit files that likely contain secrets (.env, credentials.json, etc). Warn the user if they specifically request to commit those files
- If there are no changes to commit (i.e., no untracked files and no modifications), do not create an empty commit
- ${interactiveWarning}

## Your task

Based on the above changes, create a single ${repoType} commit:

1. Analyze all changes and draft a commit message:
   - Look at the recent commits above to follow this repository's commit message style
   - Summarize the nature of the changes (new feature, enhancement, bug fix, refactoring, test, docs, etc.)
   - Ensure the message accurately reflects the changes and their purpose (i.e. "add" means a wholly new feature, "update" means an enhancement to an existing feature, "fix" means a bug fix, etc.)
   - Draft a concise (1-2 sentences) commit message that focuses on the "why" rather than the "what"

2. ${stageInstruction}
\`\`\`
${commitCmd} -m "$(cat <<'EOF'
Commit message here.${commitAttribution ? `\n\n${commitAttribution}` : ''}
EOF
)"
\`\`\`

You have the capability to call multiple tools in a single response. Add or stage files and create the commit using a single message. Do not use any other tools or do anything else. Do not send any other text or messages besides these tool calls.`
}

const command = {
  type: 'prompt',
  name: 'commit',
  description: 'Create a commit',
  allowedTools: ALLOWED_TOOLS,
  contentLength: 0, // Dynamic content
  progressMessage: 'creating commit',
  source: 'builtin',
  async getPromptForCommand(_args, context) {
    const isGit = await getIsGit()
    const isSl = !isGit && await getIsSl()
    const repoType = isGit ? 'git' : isSl ? 'sl' : 'git'
    const promptContent = getPromptContent(repoType)
    const finalContent = await executeShellCommandsInPrompt(
      promptContent,
      {
        ...context,
        getAppState() {
          const appState = context.getAppState()
          return {
            ...appState,
            toolPermissionContext: {
              ...appState.toolPermissionContext,
              alwaysAllowRules: {
                ...appState.toolPermissionContext.alwaysAllowRules,
                command: ALLOWED_TOOLS,
              },
            },
          }
        },
      },
      '/commit',
    )

    return [{ type: 'text', text: finalContent }]
  },
} satisfies Command

export default command
