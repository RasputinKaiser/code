import type {
  Command as CommanderCommand,
  Option as CommanderOption,
} from '@commander-js/extra-typings'
import { mkdir, readdir, readFile, stat, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type { LogOption } from '../../types/logs.js'
import { CACHE_PATHS } from '../../utils/cachePaths.js'
import { getCwd } from '../../utils/cwd.js'
import { errorMessage, getErrnoCode } from '../../utils/errors.js'
import { renderMessagesToPlainText } from '../../utils/exportRenderer.js'
import { findGitRoot } from '../../utils/git.js'
import { gracefulShutdown } from '../../utils/gracefulShutdown.js'
import { parseJSONL } from '../../utils/json.js'
import { getLogDisplayTitle } from '../../utils/log.js'
import { expandPath } from '../../utils/path.js'
import { writeToStderr, writeToStdout } from '../../utils/process.js'
import {
  getLastSessionLog,
  getSessionIdFromLog,
  isLiteLog,
  loadFullLog,
  loadMessageLogs,
  loadSameRepoMessageLogs,
  loadTranscriptFromFile,
} from '../../utils/sessionStorage.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import {
  createTask,
  DEFAULT_TASKS_MODE_TASK_LIST_ID,
  getTask,
  getTasksDir,
  listTasks,
  TASK_STATUSES,
  type Task,
  updateTask,
} from '../../utils/tasks.js'
import { validateUuid } from '../../utils/uuid.js'
import { getWorktreePaths } from '../../utils/getWorktreePaths.js'

type TaskListOptions = {
  list?: string
}

type TaskCreateOptions = TaskListOptions & {
  description?: string
}

type TaskFilterOptions = TaskListOptions & {
  pending?: boolean
  json?: boolean
}

type TaskUpdateOptions = TaskListOptions & {
  status?: string
  subject?: string
  description?: string
  owner?: string
  clearOwner?: boolean
}

type CompletionNode = {
  subcommands: string[]
  options: string[]
  valueOptions: string[]
}

type ErrorLogFile = {
  name: string
  fullPath: string
  modified: Date
  size: number
}

function completionKey(path: string[]): string {
  return path.join(' ')
}

function uniqSorted(values: Iterable<string>): string[] {
  return [...new Set([...values].filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  )
}

function normalizeTaskListId(listId: string | undefined): string {
  const trimmed = listId?.trim()
  return trimmed || DEFAULT_TASKS_MODE_TASK_LIST_ID
}

function formatTimestamp(date: Date): string {
  return date.toISOString().replace('T', ' ').slice(0, 19)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatTaskSummary(task: Task): string {
  const parts = [`#${task.id}`, `[${task.status}]`, task.subject]
  if (task.owner) {
    parts.push(`owner=${task.owner}`)
  }
  if (task.blockedBy.length > 0) {
    parts.push(`blockedBy=${task.blockedBy.join(',')}`)
  }
  if (task.blocks.length > 0) {
    parts.push(`blocks=${task.blocks.join(',')}`)
  }
  return parts.join(' ')
}

function normalizeSelectionIndex(
  value: number,
  length: number,
): number | null {
  if (!Number.isInteger(value)) {
    return null
  }
  const normalized = value < 0 ? Math.abs(value) : value
  return normalized >= 0 && normalized < length ? normalized : null
}

function looksLikeTranscriptPath(source: string): boolean {
  return (
    source.includes('/') ||
    source.includes('\\') ||
    source.startsWith('.') ||
    source.startsWith('~') ||
    /\.jsonl?$/i.test(source)
  )
}

async function loadConversationLogs(): Promise<LogOption[]> {
  if (!findGitRoot(getCwd())) {
    return loadMessageLogs()
  }

  try {
    const worktreePaths = await getWorktreePaths(getCwd())
    return await loadSameRepoMessageLogs(worktreePaths)
  } catch {
    return loadMessageLogs()
  }
}

async function resolveLogByIndex(index: number): Promise<LogOption | null> {
  const logs = await loadConversationLogs()
  const normalized = normalizeSelectionIndex(index, logs.length)
  return normalized === null ? null : (logs[normalized] ?? null)
}

async function resolveLogBySessionId(source: string): Promise<LogOption | null> {
  const sessionId = validateUuid(source)
  if (!sessionId) {
    return null
  }

  const logs = await loadConversationLogs()
  const matches = logs
    .filter(log => getSessionIdFromLog(log) === sessionId)
    .sort((a, b) => b.modified.getTime() - a.modified.getTime())
  if (matches.length > 0) {
    return matches[0]!
  }
  return getLastSessionLog(sessionId)
}

async function resolveLogSource(source: string): Promise<LogOption> {
  const trimmed = source.trim()
  if (!trimmed) {
    throw new Error('A log source is required.')
  }

  if (looksLikeTranscriptPath(trimmed)) {
    const resolvedPath = expandPath(trimmed)
    try {
      await stat(resolvedPath)
    } catch (error) {
      if (getErrnoCode(error) === 'ENOENT') {
        throw new Error(`Transcript file not found: ${resolvedPath}`)
      }
      throw error
    }
    return loadTranscriptFromFile(resolvedPath)
  }

  if (/^-?\d+$/.test(trimmed)) {
    const log = await resolveLogByIndex(Number.parseInt(trimmed, 10))
    if (!log) {
      throw new Error(`No conversation log found for index ${trimmed}.`)
    }
    return log
  }

  const bySessionId = await resolveLogBySessionId(trimmed)
  if (bySessionId) {
    return bySessionId
  }

  throw new Error(`Unable to resolve log source "${trimmed}".`)
}

async function ensureFullLog(log: LogOption): Promise<LogOption> {
  return isLiteLog(log) ? loadFullLog(log) : log
}

async function renderLog(log: LogOption): Promise<string> {
  const fullLog = await ensureFullLog(log)
  const width = process.stdout.columns && process.stdout.columns > 0
    ? process.stdout.columns
    : 120
  return renderMessagesToPlainText(fullLog.messages, [], width)
}

function writeJson(value: unknown): void {
  writeToStdout(jsonStringify(value, null, 2) + '\n')
}

async function listErrorLogFiles(): Promise<ErrorLogFile[]> {
  let names: string[]
  try {
    names = await readdir(CACHE_PATHS.errors())
  } catch (error) {
    if (getErrnoCode(error) === 'ENOENT') {
      return []
    }
    throw error
  }

  const files = await Promise.all(
    names
      .filter(name => name.endsWith('.jsonl'))
      .map(async name => {
        const fullPath = join(CACHE_PATHS.errors(), name)
        const info = await stat(fullPath)
        return {
          name,
          fullPath,
          modified: info.mtime,
          size: info.size,
        } satisfies ErrorLogFile
      }),
  )

  return files.sort((a, b) => b.modified.getTime() - a.modified.getTime())
}

function mergeCompletionNode(
  map: Map<string, CompletionNode>,
  key: string,
  node: CompletionNode,
): void {
  const existing = map.get(key)
  if (!existing) {
    map.set(key, {
      subcommands: uniqSorted(node.subcommands),
      options: uniqSorted(node.options),
      valueOptions: uniqSorted(node.valueOptions),
    })
    return
  }

  existing.subcommands = uniqSorted([
    ...existing.subcommands,
    ...node.subcommands,
  ])
  existing.options = uniqSorted([...existing.options, ...node.options])
  existing.valueOptions = uniqSorted([
    ...existing.valueOptions,
    ...node.valueOptions,
  ])
}

function getCommandTokens(command: CommanderCommand): string[] {
  return uniqSorted([command.name(), ...command.aliases()])
}

function getCommandOptions(command: CommanderCommand): {
  options: string[]
  valueOptions: string[]
} {
  const options = new Set<string>(['-h', '--help'])
  const valueOptions = new Set<string>()

  for (const option of command.options as CommanderOption[]) {
    if (option.hidden) {
      continue
    }
    if (option.short) {
      options.add(option.short)
      if (option.required || option.optional) {
        valueOptions.add(option.short)
      }
    }
    if (option.long) {
      options.add(option.long)
      if (option.required || option.optional) {
        valueOptions.add(option.long)
      }
    }
  }

  return {
    options: uniqSorted(options),
    valueOptions: uniqSorted(valueOptions),
  }
}

function collectCompletionTree(
  command: CommanderCommand,
  currentPath: string[],
  map: Map<string, CompletionNode>,
): void {
  const childCommands = command.commands as CommanderCommand[]
  const childTokens = uniqSorted(
    childCommands.flatMap(child => getCommandTokens(child)),
  )
  const { options, valueOptions } = getCommandOptions(command)

  mergeCompletionNode(map, completionKey(currentPath), {
    subcommands: childTokens,
    options,
    valueOptions,
  })

  for (const child of childCommands) {
    for (const token of getCommandTokens(child)) {
      collectCompletionTree(child, [...currentPath, token], map)
    }
  }
}

function shellQuote(value: string): string {
  return "'" + value.replace(/'/g, `'\"'\"'`) + "'"
}

function shellWords(values: string[]): string {
  return values.join(' ')
}

function buildShellCaseBody(
  map: Map<string, CompletionNode>,
  select: (node: CompletionNode) => string[],
): string {
  const lines: string[] = ['  case "$1" in']
  const entries = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  for (const [key, node] of entries) {
    lines.push(`    ${shellQuote(key)})`)
    lines.push(`      printf '%s\\n' ${shellQuote(shellWords(select(node)))}`)
    lines.push('      ;;')
  }

  lines.push('    *)')
  lines.push(`      printf '%s\\n' ''`)
  lines.push('      ;;')
  lines.push('  esac')
  return lines.join('\n')
}

function buildFishSwitchBody(
  map: Map<string, CompletionNode>,
  select: (node: CompletionNode) => string[],
): string {
  const lines: string[] = ['  switch $argv[1]']
  const entries = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  for (const [key, node] of entries) {
    lines.push(`    case ${shellQuote(key)}`)
    lines.push(`      printf '%s\\n' ${shellQuote(shellWords(select(node)))}`)
  }

  lines.push(`    case '*'`)
  lines.push(`      printf '%s\\n' ''`)
  lines.push('  end')
  return lines.join('\n')
}

function generateBashCompletion(program: CommanderCommand): string {
  const map = new Map<string, CompletionNode>()
  collectCompletionTree(program, [], map)

  const subcommandsCase = buildShellCaseBody(map, node => node.subcommands)
  const optionsCase = buildShellCaseBody(map, node => node.options)
  const valueOptionsCase = buildShellCaseBody(map, node => node.valueOptions)

  return `# bash completion for claude
__claude_subcommands() {
${subcommandsCase}
}

__claude_options() {
${optionsCase}
}

__claude_value_options() {
${valueOptionsCase}
}

__claude_complete() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local -a path=()
  local pending_value=0
  local i=1

  while [[ $i -lt $COMP_CWORD ]]; do
    local word="\${COMP_WORDS[i]}"
    local key="\${path[*]}"

    if [[ $pending_value -eq 1 ]]; then
      pending_value=0
      ((i++))
      continue
    fi

    if [[ "$word" == -* ]]; then
      local option_name="\${word%%=*}"
      local value_options=" $(__claude_value_options "$key") "
      if [[ "$word" != *=* && "$value_options" == *" $option_name "* ]]; then
        pending_value=1
      fi
      ((i++))
      continue
    fi

    local subcommands=" $(__claude_subcommands "$key") "
    if [[ "$subcommands" == *" $word "* ]]; then
      path+=("$word")
      ((i++))
      continue
    fi

    break
  done

  if [[ $pending_value -eq 1 ]]; then
    return 0
  fi

  local key="\${path[*]}"
  local candidates="$(__claude_subcommands "$key") $(__claude_options "$key")"
  COMPREPLY=( $(compgen -W "$candidates" -- "$cur") )
}

complete -F __claude_complete claude
`
}

function generateZshCompletion(program: CommanderCommand): string {
  const map = new Map<string, CompletionNode>()
  collectCompletionTree(program, [], map)

  const subcommandsCase = buildShellCaseBody(map, node => node.subcommands)
  const optionsCase = buildShellCaseBody(map, node => node.options)
  const valueOptionsCase = buildShellCaseBody(map, node => node.valueOptions)

  return `#compdef claude
__claude_subcommands() {
${subcommandsCase}
}

__claude_options() {
${optionsCase}
}

__claude_value_options() {
${valueOptionsCase}
}

_claude() {
  local -a path
  local pending_value=0
  local i=2

  while (( i < CURRENT )); do
    local word="\${words[i]}"
    local key="\${(j: :)path}"

    if (( pending_value )); then
      pending_value=0
      ((i++))
      continue
    fi

    if [[ "$word" == -* ]]; then
      local option_name="\${word%%=*}"
      local value_options=" $(__claude_value_options "$key") "
      if [[ "$word" != *=* && "$value_options" == *" $option_name "* ]]; then
        pending_value=1
      fi
      ((i++))
      continue
    fi

    local subcommands=" $(__claude_subcommands "$key") "
    if [[ "$subcommands" == *" $word "* ]]; then
      path+=("$word")
      ((i++))
      continue
    fi

    break
  done

  if (( pending_value )); then
    return 0
  fi

  local key="\${(j: :)path}"
  local -a candidates
  candidates=( \${(s: :)$(__claude_subcommands "$key")} \${(s: :)$(__claude_options "$key")} )
  _describe 'claude' candidates
}

compdef _claude claude
`
}

function generateFishCompletion(program: CommanderCommand): string {
  const map = new Map<string, CompletionNode>()
  collectCompletionTree(program, [], map)

  const subcommandsCase = buildFishSwitchBody(map, node => node.subcommands)
  const optionsCase = buildFishSwitchBody(map, node => node.options)
  const valueOptionsCase = buildFishSwitchBody(map, node => node.valueOptions)

  return `function __claude_subcommands
${subcommandsCase}
end

function __claude_options
${optionsCase}
end

function __claude_value_options
${valueOptionsCase}
end

function __claude_candidates
  set -l tokens (commandline -opc)
  set -e tokens[1]
  set -l path
  set -l pending_value 0

  for token in $tokens
    set -l key (string join ' ' $path)

    if test $pending_value -eq 1
      set pending_value 0
      continue
    end

    if string match -qr '^-' -- $token
      set -l option_name (string split -m1 '=' -- $token)[1]
      set -l value_options (__claude_value_options "$key")
      if not string match -qr '=' -- $token
        if contains -- $option_name $value_options
          set pending_value 1
        end
      end
      continue
    end

    set -l subcommands (__claude_subcommands "$key")
    if contains -- $token $subcommands
      set path $path $token
      continue
    end

    break
  end

  if test $pending_value -eq 1
    return 0
  end

  set -l key (string join ' ' $path)
  __claude_subcommands "$key"
  __claude_options "$key"
end

complete -c claude -f -a "(__claude_candidates)"
`
}

function generateCompletionScript(
  shell: string,
  program: CommanderCommand,
): string {
  const normalized = shell.trim().toLowerCase()
  if (normalized === 'bash') {
    return generateBashCompletion(program)
  }
  if (normalized === 'zsh') {
    return generateZshCompletion(program)
  }
  if (normalized === 'fish') {
    return generateFishCompletion(program)
  }
  throw new Error(`Unsupported shell "${shell}". Expected bash, zsh, or fish.`)
}

export async function logHandler(logId?: string | number): Promise<void> {
  try {
    if (typeof logId === 'undefined') {
      const logs = await loadConversationLogs()
      if (logs.length === 0) {
        writeToStdout('No conversation logs found.\n')
        await gracefulShutdown(0)
        return
      }

      for (const log of logs) {
        const sessionId = getSessionIdFromLog(log) ?? 'unknown'
        const title = getLogDisplayTitle(log, 'Untitled session')
        const sidechain = log.isSidechain ? ' [sidechain]' : ''
        writeToStdout(
          `${String(log.value).padStart(3)}  ${formatTimestamp(log.modified)}  ${sessionId.slice(0, 8)}  ${title}${sidechain}\n`,
        )
      }
      await gracefulShutdown(0)
      return
    }

    const log =
      typeof logId === 'number'
        ? await resolveLogByIndex(logId)
        : await resolveLogBySessionId(logId)
    if (!log) {
      throw new Error(`No conversation log found for "${String(logId)}".`)
    }

    writeToStdout(await renderLog(log))
    if (!process.stdout.destroyed) {
      writeToStdout('\n')
    }
    await gracefulShutdown(0)
  } catch (error) {
    writeToStderr(
      `Failed to load conversation log: ${errorMessage(error)}\n`,
    )
    await gracefulShutdown(1)
  }
}

export async function errorHandler(index?: number): Promise<void> {
  try {
    const files = await listErrorLogFiles()
    if (files.length === 0) {
      writeToStdout('No error logs found.\n')
      await gracefulShutdown(0)
      return
    }

    if (typeof index === 'undefined' || Number.isNaN(index)) {
      files.forEach((file, i) => {
        writeToStdout(
          `${String(i).padStart(3)}  ${formatTimestamp(file.modified)}  ${formatBytes(file.size)}  ${file.name}\n`,
        )
      })
      await gracefulShutdown(0)
      return
    }

    const normalized = normalizeSelectionIndex(index, files.length)
    if (normalized === null) {
      throw new Error(`No error log found for index ${index}.`)
    }

    const file = files[normalized]!
    const content = await readFile(file.fullPath, 'utf8')
    const parsed = parseJSONL<unknown>(content)
    if (parsed.length > 0) {
      writeJson({
        path: file.fullPath,
        modified: file.modified.toISOString(),
        entries: parsed,
      })
    } else {
      writeToStdout(content.endsWith('\n') ? content : `${content}\n`)
    }
    await gracefulShutdown(0)
  } catch (error) {
    writeToStderr(`Failed to read error logs: ${errorMessage(error)}\n`)
    await gracefulShutdown(1)
  }
}

export async function exportHandler(
  source: string,
  outputFile: string,
): Promise<void> {
  try {
    const log = await resolveLogSource(source)
    const outputPath = expandPath(outputFile)
    const rendered = await renderLog(log)

    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, rendered, 'utf8')
    writeToStdout(`Conversation exported to ${outputPath}\n`)
    await gracefulShutdown(0)
  } catch (error) {
    writeToStderr(`Failed to export conversation: ${errorMessage(error)}\n`)
    await gracefulShutdown(1)
  }
}

export async function taskCreateHandler(
  subject: string,
  opts: TaskCreateOptions = {},
): Promise<void> {
  try {
    const trimmedSubject = subject.trim()
    if (!trimmedSubject) {
      throw new Error('Task subject must not be empty.')
    }

    const taskListId = normalizeTaskListId(opts.list)
    const id = await createTask(taskListId, {
      subject: trimmedSubject,
      description: opts.description?.trim() ?? '',
      status: 'pending',
      blocks: [],
      blockedBy: [],
    })

    const task = await getTask(taskListId, id)
    if (!task) {
      throw new Error(`Created task ${id} but failed to reload it.`)
    }

    writeJson({
      taskListId,
      task,
    })
    await gracefulShutdown(0)
  } catch (error) {
    writeToStderr(`Failed to create task: ${errorMessage(error)}\n`)
    await gracefulShutdown(1)
  }
}

export async function taskListHandler(
  opts: TaskFilterOptions = {},
): Promise<void> {
  try {
    const taskListId = normalizeTaskListId(opts.list)
    let tasks = await listTasks(taskListId)
    tasks = tasks.sort((a, b) => {
      const aNum = Number.parseInt(a.id, 10)
      const bNum = Number.parseInt(b.id, 10)
      if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
        return aNum - bNum
      }
      return a.id.localeCompare(b.id)
    })

    if (opts.pending) {
      tasks = tasks.filter(task => task.status === 'pending')
    }

    if (opts.json) {
      writeJson({
        taskListId,
        tasks,
      })
      await gracefulShutdown(0)
      return
    }

    if (tasks.length === 0) {
      writeToStdout(`No tasks found in ${taskListId}.\n`)
      await gracefulShutdown(0)
      return
    }

    writeToStdout(`Task list: ${taskListId}\n`)
    for (const task of tasks) {
      writeToStdout(`${formatTaskSummary(task)}\n`)
      if (task.description) {
        writeToStdout(`    ${task.description}\n`)
      }
    }
    await gracefulShutdown(0)
  } catch (error) {
    writeToStderr(`Failed to list tasks: ${errorMessage(error)}\n`)
    await gracefulShutdown(1)
  }
}

export async function taskGetHandler(
  id: string,
  opts: TaskListOptions = {},
): Promise<void> {
  try {
    const taskListId = normalizeTaskListId(opts.list)
    const task = await getTask(taskListId, id)
    if (!task) {
      throw new Error(`Task ${id} was not found in ${taskListId}.`)
    }

    writeJson({
      taskListId,
      task,
    })
    await gracefulShutdown(0)
  } catch (error) {
    writeToStderr(`Failed to get task: ${errorMessage(error)}\n`)
    await gracefulShutdown(1)
  }
}

export async function taskUpdateHandler(
  id: string,
  opts: TaskUpdateOptions = {},
): Promise<void> {
  try {
    if (opts.clearOwner && opts.owner) {
      throw new Error('Use either --owner or --clear-owner, not both.')
    }
    if (opts.status && !TASK_STATUSES.includes(opts.status as Task['status'])) {
      throw new Error(
        `Invalid status "${opts.status}". Expected one of: ${TASK_STATUSES.join(', ')}.`,
      )
    }

    const updates: Partial<Omit<Task, 'id'>> = {}
    if (typeof opts.status !== 'undefined') {
      updates.status = opts.status as Task['status']
    }
    if (typeof opts.subject !== 'undefined') {
      updates.subject = opts.subject
    }
    if (typeof opts.description !== 'undefined') {
      updates.description = opts.description
    }
    if (typeof opts.owner !== 'undefined') {
      updates.owner = opts.owner
    }
    if (opts.clearOwner) {
      updates.owner = undefined
    }

    if (Object.keys(updates).length === 0) {
      throw new Error('No updates were specified.')
    }

    const taskListId = normalizeTaskListId(opts.list)
    const task = await updateTask(taskListId, id, updates)
    if (!task) {
      throw new Error(`Task ${id} was not found in ${taskListId}.`)
    }

    writeJson({
      taskListId,
      task,
    })
    await gracefulShutdown(0)
  } catch (error) {
    writeToStderr(`Failed to update task: ${errorMessage(error)}\n`)
    await gracefulShutdown(1)
  }
}

export async function taskDirHandler(
  opts: TaskListOptions = {},
): Promise<void> {
  const taskListId = normalizeTaskListId(opts.list)
  writeToStdout(`${getTasksDir(taskListId)}\n`)
  await gracefulShutdown(0)
}

export async function completionHandler(
  shell: string,
  opts: { output?: string } = {},
  program: CommanderCommand,
): Promise<void> {
  try {
    const script = generateCompletionScript(shell, program)
    if (opts.output) {
      const outputPath = expandPath(opts.output)
      await mkdir(dirname(outputPath), { recursive: true })
      await writeFile(outputPath, script, 'utf8')
      writeToStdout(`Wrote ${shell} completion script to ${outputPath}\n`)
    } else {
      writeToStdout(script)
      if (!script.endsWith('\n')) {
        writeToStdout('\n')
      }
    }
    await gracefulShutdown(0)
  } catch (error) {
    writeToStderr(
      `Failed to generate completion script: ${errorMessage(error)}\n`,
    )
    await gracefulShutdown(1)
  }
}
