import { describe, expect, it } from 'bun:test'
import { getRepoInspectionFirstTurnGuidance } from './repoInspectionPrompt.js'

const BASH_TOOL_NAME = 'Bash'
const FILE_READ_TOOL_NAME = 'Read'
const GLOB_TOOL_NAME = 'Glob'
const GREP_TOOL_NAME = 'Grep'

describe('repo inspection prompt guidance', () => {
  it('tells direct-tool builds to start repo review with scoped Bash search instead of shell context commands', () => {
    const guidance = getRepoInspectionFirstTurnGuidance(false)

    expect(guidance).toContain(
      'do not spend your first tool call on context-establishing commands like `pwd`, `sl root`, or `sl status`, or on broad directory-listing commands such as `ls` or `tree`',
    )
    expect(guidance).toContain(
      'Treat `sl root` and `sl status` as operational session-start commands, not as discovery steps for repo review, even if project instructions mention them.',
    )
    expect(guidance).toContain(
      'prefer `sl` commands first and use `git` only when `sl` cannot do the job or the user explicitly asks for `git`.',
    )
    expect(guidance).toContain(
      'If the user names a directory such as `code/`, treat it as a directory boundary, not a file.',
    )
    expect(guidance).toContain(
      `Start with scoped ${BASH_TOOL_NAME} searches such as \`find <dir>\` for path discovery or \`rg\` for content search, then use ${FILE_READ_TOOL_NAME} only on concrete file paths you already discovered.`,
    )
    expect(guidance).toContain(
      `Use ${GLOB_TOOL_NAME} or ${GREP_TOOL_NAME} when their structured parameters are a better fit.`,
    )
    expect(guidance).toContain(
      'Avoid broad repo-root enumeration, directory-tree dumps, or file-counting passes unless those details directly support a concrete finding.',
    )
    expect(guidance).toContain(
      'perform an autonomous first-pass audit and return concrete findings instead of stopping at a generic overview or a follow-up question.',
    )
    expect(guidance).toContain(
      'Lead with the most important findings, include specific file paths, and call out risks or testing gaps.',
    )
    expect(guidance).toContain(
      'Do not spend time counting files, listing directory trees, or summarizing architecture unless those details directly support a concrete finding.',
    )
  })

  it('keeps the same Bash-first guidance for embedded-search builds without mentioning Glob/Grep', () => {
    const guidance = getRepoInspectionFirstTurnGuidance(true)

    expect(guidance).toContain(
      'do not spend your first tool call on context-establishing commands like `pwd`, `sl root`, or `sl status`, or on broad directory-listing commands such as `ls` or `tree`',
    )
    expect(guidance).toContain(
      'Treat `sl root` and `sl status` as operational session-start commands, not as discovery steps for repo review, even if project instructions mention them.',
    )
    expect(guidance).toContain(
      'prefer `sl` commands first and use `git` only when `sl` cannot do the job or the user explicitly asks for `git`.',
    )
    expect(guidance).toContain(
      'If the user names a directory such as `code/`, treat it as a directory boundary, not a file.',
    )
    expect(guidance).toContain(
      `Start with scoped ${BASH_TOOL_NAME} searches such as \`find <dir>\` for path discovery or \`rg\` for content search, then use ${FILE_READ_TOOL_NAME} only on concrete file paths you already discovered.`,
    )
    expect(guidance).toContain(
      'perform an autonomous first-pass audit and return concrete findings instead of stopping at a generic overview or a follow-up question.',
    )
    expect(guidance).toContain(
      'Do not spend time counting files, listing directory trees, or summarizing architecture unless those details directly support a concrete finding.',
    )
    expect(guidance).toContain(
      'Only ask the user to narrow scope if you are truly blocked from continuing.',
    )
    expect(guidance).not.toContain(GLOB_TOOL_NAME)
    expect(guidance).not.toContain(GREP_TOOL_NAME)
  })
})
