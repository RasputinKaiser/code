import { spawnSync } from 'child_process'
import { randomUUID } from 'crypto'
import { z } from 'zod/v4'
import { buildTool, type Tool, type ToolDef } from '../../Tool.js'
import { execFileNoThrow } from '../../utils/execFileNoThrow.js'
import { lazySchema } from '../../utils/lazySchema.js'
import {
  ensureSocketInitialized,
  getNcodeSocketName,
  markTmuxToolUsed,
} from '../../utils/tmuxSocket.js'

const NAME = 'Tungsten'
const DEFAULT_CAPTURE_LINES = 80
const DEFAULT_SEND_WAIT_MS = 500
const DEFAULT_SCROLLBACK_LINES = 1_000
const SESSION_CREATE_SETTLE_MS = 100
const MARKER_APPEAR_TIMEOUT_MS = 1_500
const LAST_MARKER_BY_TARGET = new Map<
  string,
  {
    marker: string
    command?: string
  }
>()

const optionalWaitMs = z
  .number()
  .int()
  .min(0)
  .max(30_000)
  .optional()
  .describe('Milliseconds to wait before capturing pane output')

const optionalCaptureLines = z
  .number()
  .int()
  .min(1)
  .max(1_000)
  .optional()
  .describe('Number of pane lines to include in the returned output')

const inputSchema = lazySchema(() =>
  z.discriminatedUnion('action', [
    z.object({
      action: z.literal('create_session'),
      name: z
        .string()
        .optional()
        .describe('Session name (auto-generated if omitted)'),
      cwd: z
        .string()
        .optional()
        .describe('Working directory for the new session'),
      shell: z
        .string()
        .optional()
        .describe('Shell executable (e.g. /bin/zsh)'),
      command: z
        .string()
        .optional()
        .describe('Initial command to send after creation'),
      wait_ms: optionalWaitMs,
      capture_lines: optionalCaptureLines,
    }),
    z.object({
      action: z.literal('kill_session'),
      target: z.string().describe('Session name or tmux target'),
    }),
    z.object({
      action: z.literal('list_sessions'),
    }),
    z.object({
      action: z.literal('list_windows'),
      target: z
        .string()
        .optional()
        .describe('Optional session target; lists all windows if omitted'),
    }),
    z.object({
      action: z.literal('list_panes'),
      target: z
        .string()
        .optional()
        .describe('Optional session/window target; lists all panes if omitted'),
    }),
    z.object({
      action: z.literal('send_text'),
      target: z.string().describe('Target pane or session'),
      text: z.string().describe('Literal text to type into the session'),
    }),
    z.object({
      action: z.literal('send_keys'),
      target: z.string().describe('Target pane or session'),
      keys: z
        .array(z.string())
        .describe('Tmux key sequences (e.g. C-c, Enter, C-d)'),
    }),
    z.object({
      action: z.literal('run_command'),
      target: z.string().describe('Target pane or session'),
      command: z.string().describe('Command string to run'),
      wait_ms: optionalWaitMs,
      capture_lines: optionalCaptureLines,
    }),
    z.object({
      action: z.literal('capture_pane'),
      target: z.string().describe('Target pane or session'),
      mode: z
        .enum(['visible', 'scrollback', 'since_marker'])
        .describe('Capture visible pane, full scrollback, or text since marker'),
      lines: z
        .number()
        .optional()
        .describe('Max lines for scrollback mode'),
      marker: z
        .string()
        .optional()
        .describe('Marker for since_marker mode; defaults to last run_command marker for target'),
    }),
    // Backward-compat: deprecated send_command delegates to run_command.
    z.object({
      action: z.literal('send_command'),
      session_name: z.string(),
      command: z.string(),
      wait_ms: optionalWaitMs,
      capture_lines: optionalCaptureLines,
    }),
  ])
)

const outputSchema = lazySchema(() =>
  z.object({
    tmux_exit_code: z.number(),
    target: z.string().optional(),
    session_id: z.string().optional(),
    window_id: z.string().optional(),
    pane_id: z.string().optional(),
    capture_mode: z.string().optional(),
    marker: z.string().optional(),
    marker_found: z.boolean().optional(),
    pane_output: z.string().optional(),
    stderr: z.string().optional(),
    summary: z.string().optional(),
  })
)

type InputSchema = ReturnType<typeof inputSchema>
type OutputSchema = ReturnType<typeof outputSchema>
export type TungstenOutput = z.infer<OutputSchema>

type ExecTmuxResult = {
  stdout: string
  stderr: string
  code: number
}

async function execTmux(args: string[]): Promise<ExecTmuxResult> {
  const socket = getNcodeSocketName()
  const r = await execFileNoThrow('tmux', ['-L', socket, ...args], {
    useCwd: false,
  })
  return {
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
    code: r.code ?? 0,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function normalizePaneOutput(output: string): string {
  const lines = output.replace(/\r\n/g, '\n').split('\n')
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === '') {
    lines.pop()
  }
  // Collapse trailing blank lines but preserve internal spacing
  return lines.join('\n')
}

function isNoumenaEnabled(): boolean {
  return (
    process.env.NCODE_BUILD_MODE === 'noumena' ||
    process.env.USER_TYPE === 'noumena'
  )
}

// Strip tmux format noise from structured list outputs, keeping only data lines.
function cleanListOutput(raw: string): string {
  return raw
    .split('\n')
    .filter(l => {
      const t = l.trim()
      return t.length > 0 && !t.startsWith('no server') && !t.startsWith('error:')
    })
    .join('\n')
}

async function createTmuxSession(opts: {
  name: string
  cwd?: string
  shell?: string
}): Promise<{
  result: ExecTmuxResult
  sessionName: string
  ids?: { sessionId: string; windowId: string; paneId: string }
}> {
  const args = [
    'new-session',
    '-d',
    '-P',
    '-F',
    'SESS:#{session_name}|#{session_id}|#{window_id}|#{pane_id}',
    '-s',
    opts.name,
  ]
  if (opts.cwd) {
    args.push('-c', opts.cwd)
  }
  if (opts.shell) {
    args.push(opts.shell)
  }

  const result = await execTmux(args)
  if (result.code !== 0) {
    return { result, sessionName: opts.name }
  }
  await sleep(SESSION_CREATE_SETTLE_MS)

  const line = result.stdout
    .split('\n')
    .find(l => l.trim().startsWith('SESS:'))
  if (line) {
    const parts = line.replace('SESS:', '').split('|')
    const returnedSessionName = parts[0] || opts.name
    return {
      result,
      sessionName: returnedSessionName,
      ids: {
        sessionId: parts[1] ?? '',
        windowId: parts[2] ?? '',
        paneId: parts[3] ?? '',
      },
    }
  }

  return { result, sessionName: opts.name }
}

async function sendTmuxText(
  target: string,
  text: string,
): Promise<ExecTmuxResult> {
  // Large or multiline text → set-buffer + paste-buffer
  if (text.includes('\n') || text.length > 2_000) {
    const buf = await execTmux(['set-buffer', text])
    if (buf.code !== 0) return buf
    const paste = await execTmux(['paste-buffer', '-t', target])
    return {
      stdout: [buf.stdout, paste.stdout].filter(Boolean).join('\n'),
      stderr: [buf.stderr, paste.stderr].filter(Boolean).join('\n'),
      code: paste.code,
    }
  }
  return execTmux(['send-keys', '-t', target, '-l', text])
}

async function sendTmuxKeys(
  target: string,
  keys: string[],
): Promise<ExecTmuxResult> {
  return execTmux(['send-keys', '-t', target, ...keys])
}

async function captureTmuxPane(
  target: string,
  mode: 'visible' | 'scrollback',
  maxLines?: number,
): Promise<ExecTmuxResult> {
  const args: string[] = ['capture-pane', '-p', '-J', '-t', target]
  if (mode === 'scrollback') {
    if (maxLines !== undefined && maxLines > 0) {
      args.push('-S', `-${String(maxLines)}`)
    } else {
      args.push('-S', '-')
    }
  }
  const result = await execTmux(args)
  return {
    ...result,
    stdout: normalizePaneOutput(result.stdout),
  }
}

/**
 * Marker-based convenience wrapper.
 * 1. Send a visible sentinel line.
 * 2. Send the literal command + Enter.
 * 3. Wait.
 * 4. Capture scrollback.
 * 5. Return content after the marker line.
 *
 * tmux_exit_code reflects tmux control success (send-keys/capture-pane),
 * NOT shell command completion.
 */
async function runTmuxCommand(
  target: string,
  command: string,
  options?: { waitMs?: number; captureLines?: number },
): Promise<{
  marker: string
  markerFound: boolean
  tmuxExitCode: number
  stderr: string
  paneOutput: string
}> {
  const marker = `__NCODE_TUNGSTEN_${randomUUID().replace(/-/g, '')}__`

  // 1. Inject marker
  //    Use "printf '%s\n'" instead of echo to avoid shell escaping issues.
  const markerText = `printf '%s\\n' '${marker}'`
  const mk = await sendTmuxText(target, markerText)
  if (mk.code !== 0) {
    return {
      marker,
      markerFound: false,
      tmuxExitCode: mk.code,
      stderr: mk.stderr,
      paneOutput: '',
    }
  }
  const mkEnter = await sendTmuxKeys(target, ['Enter'])
  if (mkEnter.code !== 0) {
    return {
      marker,
      markerFound: false,
      tmuxExitCode: mkEnter.code,
      stderr: mkEnter.stderr,
      paneOutput: '',
    }
  }
  await waitForMarker(target, marker)

  // 2. Send the command
  const sent = await sendTmuxText(target, command)
  if (sent.code !== 0) {
    return {
      marker,
      markerFound: false,
      tmuxExitCode: sent.code,
      stderr: sent.stderr,
      paneOutput: '',
    }
  }
  const sentEnter = await sendTmuxKeys(target, ['Enter'])
  if (sentEnter.code !== 0) {
    return {
      marker,
      markerFound: false,
      tmuxExitCode: sentEnter.code,
      stderr: sentEnter.stderr,
      paneOutput: '',
    }
  }

  // 3. Wait
  const waitMs = options?.waitMs ?? DEFAULT_SEND_WAIT_MS
  if (waitMs > 0) await sleep(waitMs)

  // 4. Capture scrollback
  const lines =
    options?.captureLines ??
    Math.min(DEFAULT_SCROLLBACK_LINES, DEFAULT_CAPTURE_LINES * 2)
  const cap = await captureTmuxPane(target, 'scrollback', lines)

  // 5. Find marker and strip
  const { found, output } = extractAfterMarker(cap.stdout, marker, command)
  LAST_MARKER_BY_TARGET.set(target, { marker, command })

  return {
    marker,
    markerFound: found,
    tmuxExitCode: cap.code,
    stderr: [mk.stderr, sent.stderr, cap.stderr].filter(Boolean).join('\n'),
    paneOutput: output,
  }
}

function extractAfterMarker(
  output: string,
  marker: string,
  command?: string,
): { found: boolean; output: string } {
  const lines = output.split('\n')
  // Find the first line that matches the marker.
  const idx = lines.findIndex(l => l.trim() === marker)
  if (idx === -1) {
    return { found: false, output }
  }
  // Strip everything up to and including the marker line.
  const after = lines.slice(idx + 1)
  // Trim leading blank lines that trail the marker.
  while (after.length > 0 && after[0]!.trim() === '') {
    after.shift()
  }
  if (command) {
    const normalizedCommand = command.trim()
    if (
      normalizedCommand &&
      after.length > 0 &&
      after[0]!.includes(normalizedCommand)
    ) {
      after.shift()
    }
  }
  // Trim trailing blank lines.
  while (after.length > 0 && after[after.length - 1]!.trim() === '') {
    after.pop()
  }
  if (after.length > 0 && /^([^\w]*)[❯>$#%]\s*$/.test(after[after.length - 1]!.trim())) {
    after.pop()
  }
  return { found: true, output: after.join('\n') }
}

async function waitForMarker(
  target: string,
  marker: string,
  timeoutMs = MARKER_APPEAR_TIMEOUT_MS,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const capture = await captureTmuxPane(target, 'scrollback', DEFAULT_CAPTURE_LINES)
    if (capture.stdout.split('\n').some(line => line.trim() === marker)) {
      return true
    }
    await sleep(50)
  }
  return false
}

export const TungstenTool: Tool<InputSchema, TungstenOutput> = buildTool({
  name: NAME,
  maxResultSizeChars: 100_000,
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  async description() {
    return 'Low-level tmux terminal-session substrate.'
  },
  async prompt() {
    return [
      'Tungsten is a tmux-backed terminal-session substrate, NOT a subprocess wrapper.',
      'Use Tungsten for: long-running processes, REPLs, TUIs, dev servers, SSH, debuggers, watchers.',
      'Use Bash for: one-shot deterministic commands (rg, cat, pytest, curl).',
      '',
      'Actions:',
      '- create_session: create a new tmux session (optional cwd, shell, initial command)',
      '- kill_session: terminate a session or target',
      '- list_sessions: all active sessions',
      '- list_windows: windows in a session (or all)',
      '- list_panes: panes in a target (or all)',
      '- send_text: send literal text (send-keys -l; set-buffer for large text)',
      '- send_keys: raw tmux keys (C-c, Enter, C-d)',
      '- run_command: convenience wrapper (marker → command → wait → capture since marker)',
      '- capture_pane: capture visible pane or scrollback',
      '- send_command: DEPRECATED — use run_command instead',
      '',
      'Important:',
      '- run_command returns tmux control success, NOT shell exit codes.',
      '- marker_found confirms the sentinel was seen; pane_output is text after the marker.',
      '- capture_pane returns raw terminal text, not structured stdout.',
    ].join('\n')
  },
  userFacingName() {
    return NAME
  },
  isEnabled() {
    if (!isNoumenaEnabled()) return false
    try {
      const r = spawnSync('tmux', ['-V'], { encoding: 'utf-8' })
      return r.status === 0
    } catch {
      return false
    }
  },
  isConcurrencySafe() {
    return false
  },
  isReadOnly(input) {
    return (
      input.action === 'capture_pane' ||
      input.action === 'list_sessions' ||
      input.action === 'list_windows' ||
      input.action === 'list_panes'
    )
  },
  renderToolUseMessage() {
    return null
  },
  renderToolUseProgressMessage() {
    return null
  },
  renderToolUseQueuedMessage() {
    return null
  },
  renderToolUseRejectedMessage() {
    return null
  },
  renderToolResultMessage() {
    return null
  },
  renderToolUseErrorMessage() {
    return null
  },
  async call(input, toolUseContext) {
    markTmuxToolUsed()
    const { setAppState } = toolUseContext
    await ensureSocketInitialized()
    const socket = getNcodeSocketName()

    switch (input.action) {
      case 'create_session': {
        const sessionName =
          input.name || `ncode-${process.pid}-${Date.now().toString(36)}`
        const created = await createTmuxSession({
          name: sessionName,
          cwd: input.cwd,
          shell: input.shell,
        })

        let paneOutput = ''
        let stderr = created.result.stderr
        let exitCode = created.result.code

        if (created.result.code === 0) {
          setAppState(prev => ({
            ...prev,
            tungstenActiveSession: {
              sessionName,
              socketName: socket,
              target: `${sessionName}:0.0`,
              sessionId: created.ids?.sessionId,
              windowId: created.ids?.windowId,
              paneId: created.ids?.paneId,
            },
            tungstenPanelVisible: false,
            tungstenPanelAutoHidden: true,
          }))

          // Optional initial command — simple send, no marker cleanup.
          if (input.command) {
            const sent = await sendTmuxText(sessionName, input.command)
            const enter = await sendTmuxKeys(sessionName, ['Enter'])
            const waitMs = input.wait_ms ?? DEFAULT_SEND_WAIT_MS
            if (waitMs > 0) await sleep(waitMs)
            const cap = await captureTmuxPane(
              sessionName,
              'scrollback',
              input.capture_lines ?? DEFAULT_CAPTURE_LINES,
            )
            stderr = [stderr, sent.stderr, enter.stderr, cap.stderr]
              .filter(Boolean)
              .join('\n')
            exitCode = enter.code || sent.code || cap.code
            paneOutput = cap.stdout
          }
        }

        return {
          data: {
            tmux_exit_code: exitCode,
            target: `${sessionName}:0.0`,
            session_id: created.ids?.sessionId,
            window_id: created.ids?.windowId,
            pane_id: created.ids?.paneId,
            pane_output: paneOutput || undefined,
            stderr: stderr || undefined,
            summary: input.command
              ? `created session ${sessionName} and sent initial command`
              : `created session ${sessionName}`,
          },
        }
      }

      case 'kill_session': {
        const result = await execTmux([
          'kill-session',
          '-t',
          input.target,
        ])

        setAppState(prev => {
          if (prev.tungstenActiveSession?.sessionName === input.target) {
            return {
              ...prev,
              tungstenActiveSession: undefined,
              tungstenPanelVisible: undefined,
              tungstenPanelAutoHidden: undefined,
            }
          }
          return prev
        })

        return {
          data: {
            tmux_exit_code: result.code,
            target: input.target,
            stderr: result.stderr || undefined,
            summary: `killed target ${input.target}`,
          },
        }
      }

      case 'list_sessions': {
        const result = await execTmux([
          'list-sessions',
          '-F',
          '#{session_name}\t#{session_id}\t#{session_windows}',
        ])
        return {
          data: {
            tmux_exit_code: result.code,
            stderr: result.stderr || undefined,
            pane_output: cleanListOutput(result.stdout) || undefined,
            summary: result.stdout.trim()
              ? 'listed Tungsten sessions'
              : 'no Tungsten sessions found',
          },
        }
      }

      case 'list_windows': {
        const args = ['list-windows', '-F', '#{window_id}\t#{window_name}\t#{window_panes}\t#{session_name}']
        if (input.target) args.push('-t', input.target)
        const result = await execTmux(args)
        return {
          data: {
            tmux_exit_code: result.code,
            target: input.target,
            stderr: result.stderr || undefined,
            pane_output: cleanListOutput(result.stdout) || undefined,
            summary: result.stdout.trim()
              ? `listed Tungsten windows${input.target ? ` for ${input.target}` : ''}`
              : 'no Tungsten windows found',
          },
        }
      }

      case 'list_panes': {
        const args = ['list-panes', '-F', '#{pane_id}\t#{pane_current_path}\t#{pane_current_command}\t#{session_name}\t#{window_name}']
        if (input.target) args.push('-t', input.target)
        const result = await execTmux(args)
        return {
          data: {
            tmux_exit_code: result.code,
            target: input.target,
            stderr: result.stderr || undefined,
            pane_output: cleanListOutput(result.stdout) || undefined,
            summary: result.stdout.trim()
              ? `listed Tungsten panes${input.target ? ` for ${input.target}` : ''}`
              : 'no Tungsten panes found',
          },
        }
      }

      case 'send_text': {
        const result = await sendTmuxText(input.target, input.text)
        setAppState(prev => ({
          ...prev,
          tungstenPanelAutoHidden: true,
        }))
        return {
          data: {
            tmux_exit_code: result.code,
            target: input.target,
            stderr: result.stderr || undefined,
            summary: `sent ${input.text.length} chars to ${input.target}`,
          },
        }
      }

      case 'send_keys': {
        const result = await sendTmuxKeys(input.target, input.keys)
        setAppState(prev => ({
          ...prev,
          tungstenPanelAutoHidden: true,
        }))
        return {
          data: {
            tmux_exit_code: result.code,
            target: input.target,
            stderr: result.stderr || undefined,
            summary: `sent keys [${input.keys.join(' ')}] to ${input.target}`,
          },
        }
      }

      case 'run_command': {
        const ran = await runTmuxCommand(
          input.target,
          input.command,
          {
            waitMs: input.wait_ms,
            captureLines: input.capture_lines,
          },
        )

        setAppState(prev => ({
          ...prev,
          tungstenLastCommand: {
            command: input.command,
            timestamp: Date.now(),
          },
          tungstenPanelAutoHidden: true,
        }))

        return {
          data: {
            tmux_exit_code: ran.tmuxExitCode,
            target: input.target,
            capture_mode: 'since_marker',
            marker: ran.marker,
            marker_found: ran.markerFound,
            pane_output: ran.paneOutput || undefined,
            stderr: ran.stderr || undefined,
            summary: ran.markerFound
              ? `ran command on ${input.target} (marker found)`
              : `ran command on ${input.target} (marker NOT found — showing full capture)`,
          },
        }
      }

      case 'capture_pane': {
        const captureMode = input.mode
        const result = await captureTmuxPane(
          input.target,
          captureMode === 'since_marker' ? 'scrollback' : captureMode,
          input.lines,
        )
        const marker =
          captureMode === 'since_marker'
            ? input.marker ?? LAST_MARKER_BY_TARGET.get(input.target)?.marker
            : undefined
        const markerCommand =
          captureMode === 'since_marker'
            ? LAST_MARKER_BY_TARGET.get(input.target)?.command
            : undefined
        const markerResult =
          captureMode === 'since_marker' && marker
            ? extractAfterMarker(result.stdout, marker, markerCommand)
            : undefined

        setAppState(prev => ({
          ...prev,
          tungstenLastCapturedTime: Date.now(),
          tungstenPanelAutoHidden: true,
        }))

        return {
          data: {
            tmux_exit_code: result.code,
            target: input.target,
            capture_mode: captureMode,
            marker,
            marker_found:
              captureMode === 'since_marker'
                ? markerResult?.found ?? false
                : undefined,
            pane_output: (markerResult?.output ?? result.stdout) || undefined,
            stderr: result.stderr || undefined,
            summary: `captured ${captureMode} from ${input.target}`,
          },
        }
      }

      case 'send_command': {
        // Deprecated alias → delegate to run_command.
        const ran = await runTmuxCommand(
          input.session_name,
          input.command,
          {
            waitMs: input.wait_ms,
            captureLines: input.capture_lines,
          },
        )

        setAppState(prev => ({
          ...prev,
          tungstenLastCommand: {
            command: input.command,
            timestamp: Date.now(),
          },
          tungstenPanelAutoHidden: true,
        }))

        return {
          data: {
            tmux_exit_code: ran.tmuxExitCode,
            target: input.session_name,
            capture_mode: 'since_marker',
            marker: ran.marker,
            marker_found: ran.markerFound,
            pane_output: ran.paneOutput || undefined,
            stderr: ran.stderr || undefined,
            summary: `[deprecated send_command] ${input.session_name}: ${input.command}`,
          },
        }
      }
    }
  },
  mapToolResultToToolResultBlockParam(result, toolUseID) {
    const lines: string[] = []
    if (result.target) {
      lines.push(`Target: ${result.target}`)
    }
    if (result.session_id) {
      lines.push(`Session ID: ${result.session_id}`)
    }
    if (result.window_id) {
      lines.push(`Window ID: ${result.window_id}`)
    }
    if (result.pane_id) {
      lines.push(`Pane ID: ${result.pane_id}`)
    }
    lines.push(`tmux exit code: ${result.tmux_exit_code}`)
    if (result.capture_mode) {
      lines.push(`Capture mode: ${result.capture_mode}`)
    }
    if (result.marker_found !== undefined) {
      lines.push(`Marker found: ${result.marker_found}`)
    }
    if (result.summary) {
      lines.push(`Summary: ${result.summary}`)
    }
    if (result.stderr) {
      lines.push(`stderr: ${result.stderr}`)
    }
    if (result.pane_output) {
      lines.push('Pane output:')
      lines.push(result.pane_output)
    }

    return {
      type: 'tool_result',
      content: lines.join('\n'),
      tool_use_id: toolUseID,
    }
  },
} satisfies ToolDef<InputSchema, TungstenOutput>)
