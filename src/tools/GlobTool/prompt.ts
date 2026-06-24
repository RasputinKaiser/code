export const GLOB_TOOL_NAME = 'Glob'

export const DESCRIPTION = `- Fast file pattern matching tool that works with any codebase size
- Supports glob patterns like "**/*.js" or "src/**/*.ts"
- Returns matching file paths sorted by modification time
- Structured helper for glob-pattern file and directory discovery, filename matching, and repo structure inspection
- Use this tool when glob syntax is simpler than Bash \`find\` or when structured path output is preferable
- For routine scoped shell discovery, Bash \`find\` or a targeted \`ls\` is also appropriate
- Use Grep or Bash \`rg\` for searching file contents rather than path names
- When you are doing an open ended search that may require multiple rounds of globbing and grepping, use the Agent tool instead`
