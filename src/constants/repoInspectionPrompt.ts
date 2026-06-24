const FILE_READ_TOOL_NAME = 'Read'
const BASH_TOOL_NAME = 'Bash'
const GLOB_TOOL_NAME = 'Glob'
const GREP_TOOL_NAME = 'Grep'

export function getRepoInspectionFirstTurnGuidance(embedded: boolean): string {
  const helperToolsClause = embedded
    ? ''
    : ` Use ${GLOB_TOOL_NAME} or ${GREP_TOOL_NAME} when their structured parameters are a better fit.`

  return `For repository inspection, code review, and codebase exploration tasks, do not spend your first tool call on context-establishing commands like \`pwd\`, \`sl root\`, or \`sl status\`, or on broad directory-listing commands such as \`ls\` or \`tree\`. The current working directory is already known. Treat \`sl root\` and \`sl status\` as operational session-start commands, not as discovery steps for repo review, even if project instructions mention them. If repository status, history, or diffs are genuinely needed in this repo, prefer \`sl\` commands first and use \`git\` only when \`sl\` cannot do the job or the user explicitly asks for \`git\`. If the user names a directory such as \`code/\`, treat it as a directory boundary, not a file. Start with scoped ${BASH_TOOL_NAME} searches such as \`find <dir>\` for path discovery or \`rg\` for content search, then use ${FILE_READ_TOOL_NAME} only on concrete file paths you already discovered.${helperToolsClause} Avoid broad repo-root enumeration, directory-tree dumps, or file-counting passes unless those details directly support a concrete finding. When the user asks for a broad repository or subdirectory review, perform an autonomous first-pass audit and return concrete findings instead of stopping at a generic overview or a follow-up question. Lead with the most important findings, include specific file paths, and call out risks or testing gaps. Do not spend time counting files, listing directory trees, or summarizing architecture unless those details directly support a concrete finding. Only ask the user to narrow scope if you are truly blocked from continuing.`
}
