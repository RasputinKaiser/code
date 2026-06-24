import type { Command } from '../commands.js'
import {
  getAttributionTexts,
  getEnhancedPRAttribution,
} from '../utils/attribution.js'
import { getDefaultBranch, getIsGit, getIsSl } from '../utils/git.js'
import { executeShellCommandsInPrompt } from '../utils/promptShellExecution.js'
import { getUndercoverInstructions, isUndercover } from '../utils/undercover.js'
import { isInternalBuild } from 'src/capabilities/static.js'

const ALLOWED_TOOLS = [
  'Bash(git checkout --branch:*)',
  'Bash(git checkout -b:*)',
  'Bash(git add:*)',
  'Bash(git status:*)',
  'Bash(git diff:*)',
  'Bash(git branch:*)',
  'Bash(git push:*)',
  'Bash(git commit:*)',
  'Bash(sl book:*)',
  'Bash(sl smartlog:*)',
  'Bash(sl add:*)',
  'Bash(sl status:*)',
  'Bash(sl diff:*)',
  'Bash(sl log:*)',
  'Bash(sl push:*)',
  'Bash(sl commit:*)',
  'Bash(gh pr create:*)',
  'Bash(gh pr edit:*)',
  'Bash(gh pr view:*)',
  'Bash(gh pr merge:*)',
  'ToolSearch',
  'mcp__slack__send_message',
  'mcp__claude_ai_Slack__slack_send_message',
]

function getPromptContent(
  repoType: 'git' | 'sl',
  defaultBranch: string,
  prAttribution?: string,
): string {
  const { commit: commitAttribution, pr: defaultPrAttribution } =
    getAttributionTexts()
  // Use provided PR attribution or fall back to default
  const effectivePrAttribution = prAttribution ?? defaultPrAttribution
  const safeUser = process.env.SAFEUSER || ''
  const username = process.env.USER || ''

  let prefix = ''
  let reviewerArg = ' and `--reviewer anthropics/claude-code`'
  let addReviewerArg = ' (and add `--add-reviewer anthropics/claude-code`)'
  let changelogSection = `

## Changelog
<!-- CHANGELOG:START -->
[If this PR contains user-facing changes, add a changelog entry here. Otherwise, remove this section.]
<!-- CHANGELOG:END -->`
  let slackStep = `

5. After creating/updating the PR, check if the user's NCODE.md (or legacy CLAUDE.md) mentions posting to Slack channels. If it does, use ToolSearch to search for "slack send message" tools. If ToolSearch finds a Slack tool, ask the user if they'd like me to post the PR URL to the relevant Slack channel. Only post if the user confirms. If ToolSearch returns no results or errors, skip this step silently—do not mention the failure, do not attempt workarounds, and do not try alternative approaches.`
  if (isInternalBuild() && isUndercover()) {
    prefix = getUndercoverInstructions() + '\n'
    reviewerArg = ''
    addReviewerArg = ''
    changelogSection = ''
    slackStep = ''
  }

  const isGit = repoType === 'git'
  const statusCmd = isGit ? 'git status' : 'sl status'
  const diffCmd = isGit ? 'git diff HEAD' : 'sl diff'
  const branchCmd = isGit ? 'git branch --show-current' : 'sl book'
  const smartlogLine = isGit ? '' : `\n- \`sl smartlog\`: !\`sl smartlog\``
  const rangeDiffCmd = isGit
    ? `git diff ${defaultBranch}...HEAD`
    : `sl diff -r ${defaultBranch}`
  const scmSafety = isGit ? 'Git Safety Protocol' : 'Sl Safety Protocol'
  const configWarning = isGit ? 'NEVER update the git config' : 'NEVER update the sl config'
  const destructiveWarning = isGit
    ? 'NEVER run destructive/irreversible git commands (like push --force, hard reset, etc)'
    : 'NEVER run destructive/irreversible sl commands (like push --force, hard reset, etc)'
  const interactiveWarning = isGit
    ? 'Never use git commands with the -i flag (like git rebase -i or git add -i) since they require interactive input which is not supported'
    : 'Never use sl commands with the -i flag (like sl rebase -i or sl add -i) since they require interactive input which is not supported'
  const branchAction = isGit
    ? `Create a new branch if on ${defaultBranch} (use SAFEUSER from context above for the branch name prefix, falling back to whoami if SAFEUSER is empty, e.g., \`username/feature-name\`)`
    : `Create a new bookmark if on ${defaultBranch} (use SAFEUSER from context above for the bookmark name prefix, falling back to whoami if SAFEUSER is empty, e.g., \`username/feature-name\`) using \`sl book <name>\``
  const commitCmd = isGit ? 'git commit' : 'sl commit'
  const pushCmd = isGit
    ? 'Push the branch to origin'
    : 'Push the bookmark to origin using \`sl push -B <bookmark>\`'

  return `${prefix}## Context

- \`SAFEUSER\`: ${safeUser}
- \`whoami\`: ${username}
- \`${statusCmd}\`: !\`${statusCmd}\`
- \`${diffCmd}\`: !\`${diffCmd}\`
- \`${branchCmd}\`: !\`${branchCmd}\`${smartlogLine}
- \`${rangeDiffCmd}\`: !\`${rangeDiffCmd}\`
- \`gh pr view --json number 2>/dev/null || true\`: !\`gh pr view --json number 2>/dev/null || true\`

## ${scmSafety}

- ${configWarning}
- ${destructiveWarning} unless the user explicitly requests them
- NEVER skip hooks (--no-verify, --no-gpg-sign, etc) unless the user explicitly requests it
- NEVER run force push to main/master, warn the user if they request it
- Do not commit files that likely contain secrets (.env, credentials.json, etc)
- ${interactiveWarning}

## Your task

Analyze all changes that will be included in the pull request, making sure to look at all relevant commits (NOT just the latest commit, but ALL commits that will be included in the pull request from the ${rangeDiffCmd} output above).

Based on the above changes:
1. ${branchAction}
2. Create a single ${repoType} commit with an appropriate message using heredoc syntax${commitAttribution ? `, ending with the attribution text shown in the example below` : ''}:
\`\`\`
${commitCmd} -m "$(cat <<'EOF'
Commit message here.${commitAttribution ? `\n\n${commitAttribution}` : ''}
EOF
)"
\`\`\`
3. ${pushCmd}
4. If a PR already exists for this ${isGit ? 'branch' : 'bookmark'} (check the gh pr view output above), update the PR title and body using \`gh pr edit\` to reflect the current diff${addReviewerArg}. Otherwise, create a pull request using \`gh pr create\` with heredoc syntax for the body${reviewerArg}.
   - IMPORTANT: Keep PR titles short (under 70 characters). Use the body for details.
\`\`\`
gh pr create --title "Short, descriptive title" --body "$(cat <<'EOF'
## Summary
<1-3 bullet points>

## Test plan
[Bulleted markdown checklist of TODOs for testing the pull request...]${changelogSection}${effectivePrAttribution ? `\n\n${effectivePrAttribution}` : ''}
EOF
)"
\`\`\`

You have the capability to call multiple tools in a single response. You MUST do all of the above in a single message.${slackStep}

Return the PR URL when you're done, so the user can see it.`
}

const command = {
  type: 'prompt',
  name: 'commit-push-pr',
  description: 'Commit, push, and open a PR',
  allowedTools: ALLOWED_TOOLS,
  get contentLength() {
    // Use 'main' as estimate for content length calculation
    return getPromptContent('git', 'main').length
  },
  progressMessage: 'creating commit and PR',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    // Get default branch and enhanced PR attribution
    const [defaultBranch, prAttribution] = await Promise.all([
      getDefaultBranch(),
      getEnhancedPRAttribution(context.getAppState),
    ])
    const isGit = await getIsGit()
    const isSl = !isGit && await getIsSl()
    const repoType = isGit ? 'git' : isSl ? 'sl' : 'git'
    let promptContent = getPromptContent(repoType, defaultBranch, prAttribution)

    // Append user instructions if args provided
    const trimmedArgs = args?.trim()
    if (trimmedArgs) {
      promptContent += `\n\n## Additional instructions from user\n\n${trimmedArgs}`
    }

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
      '/commit-push-pr',
    )

    return [{ type: 'text', text: finalContent }]
  },
} satisfies Command

export default command
