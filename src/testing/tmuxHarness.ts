import {
  spawn,
  spawnSync,
  type ChildProcessWithoutNullStreams,
} from 'child_process'
import { randomUUID } from 'crypto'

export type IsolatedTmuxSession = {
  readonly sessionName: string
  readonly socketName: string
  readonly targetPane: string
}

export type PaneCaptureOptions = {
  readonly alternate?: boolean
  readonly includeEscape?: boolean
  readonly startLine?: number
}

export type TmuxAttachedClient = {
  readonly process: ChildProcessWithoutNullStreams
}

export type TmuxAttachedTraceStep = {
  readonly label: string
  readonly input?: string
  readonly settleMs?: number
  readonly capture?: boolean
}

export type TmuxTraceFrame = {
  readonly label: string
  readonly pane: string
  readonly cursorX: number
  readonly cursorY: number
  readonly historySize: number
  readonly paneWidth: number
  readonly paneHeight: number
}

export type CaptureAttachedTmuxTraceOptions = {
  readonly attachTimeoutMs?: number
  readonly initialDelayMs?: number
  readonly captureInitial?: boolean
  readonly initialLabel?: string
  readonly paneCapture?: PaneCaptureOptions
}

function getTmuxTestEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  delete env.TMUX
  return env
}

function runTmux(
  socketName: string,
  args: string[],
): ReturnType<typeof spawnSync> & { stdout: string; stderr: string } {
  const result = spawnSync('tmux', ['-L', socketName, ...args], {
    env: getTmuxTestEnv(),
    encoding: 'utf8',
  }) as ReturnType<typeof spawnSync> & { stdout: string; stderr: string }

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(
      `tmux ${args.join(' ')} failed (${result.status}): ${result.stderr.trim()}`,
    )
  }

  return result
}

export function isTmuxAvailableForTests(): boolean {
  const result = spawnSync('tmux', ['-V'], {
    env: getTmuxTestEnv(),
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    return false
  }

  const socketName = `code-test-probe-${process.pid}-${randomUUID().slice(0, 8)}`
  const sessionName = `code-test-probe-${randomUUID().slice(0, 8)}`
  const env = getTmuxTestEnv()

  try {
    const createResult = spawnSync(
      'tmux',
      [
        '-L',
        socketName,
        '-f',
        '/dev/null',
        'new-session',
        '-d',
        '-x',
        '40',
        '-y',
        '12',
        '-s',
        sessionName,
        'true',
      ],
      {
        env,
        encoding: 'utf8',
      },
    )

    if (createResult.status !== 0) {
      return false
    }

    spawnSync('tmux', ['-L', socketName, 'kill-server'], {
      env,
      encoding: 'utf8',
    })
    return true
  } catch {
    return false
  }
}

export function createIsolatedTmuxSession(opts: {
  command: string
  width?: number
  height?: number
}): IsolatedTmuxSession {
  const width = opts.width ?? 80
  const height = opts.height ?? 24
  const sessionName = `code-test-${randomUUID().slice(0, 8)}`
  const socketName = `code-test-${process.pid}-${randomUUID().slice(0, 8)}`

  runTmux(socketName, [
    '-f',
    '/dev/null',
    'new-session',
    '-d',
    '-x',
    String(width),
    '-y',
    String(height),
    '-s',
    sessionName,
    opts.command,
  ])

  return {
    sessionName,
    socketName,
    targetPane: `${sessionName}:0.0`,
  }
}

export function destroyIsolatedTmuxSession(
  session: IsolatedTmuxSession,
): void {
  try {
    runTmux(session.socketName, ['kill-server'])
  } catch {
    // Best-effort cleanup for tests.
  }
}

export function capturePane(
  session: IsolatedTmuxSession,
  opts?: PaneCaptureOptions,
): string {
  const args = ['capture-pane']
  if (opts?.alternate) args.push('-a')
  if (opts?.includeEscape) args.push('-e')
  args.push(
    '-p',
    '-S',
    String(opts?.startLine ?? -50),
    '-t',
    session.targetPane,
  )

  return runTmux(session.socketName, args).stdout
}

export function sendKeys(
  session: IsolatedTmuxSession,
  ...keys: string[]
): void {
  if (keys.length === 0) return
  runTmux(session.socketName, ['send-keys', '-t', session.targetPane, ...keys])
}

export function sendLiteral(
  session: IsolatedTmuxSession,
  text: string,
): void {
  runTmux(session.socketName, [
    'send-keys',
    '-t',
    session.targetPane,
    '-l',
    text,
  ])
}

export function getSessionTmuxEnv(session: IsolatedTmuxSession): string {
  return runTmux(session.socketName, [
    'display-message',
    '-p',
    '-t',
    session.targetPane,
    '#{socket_path},#{pid},#{pane_id}',
  ]).stdout.trim()
}

export function setGlobalOption(
  session: IsolatedTmuxSession,
  option: string,
  value: string,
): void {
  runTmux(session.socketName, ['set-option', '-g', option, value])
}

export function shellQuote(value: string): string {
  return `'${value.replaceAll(`'`, `'\"'\"'`)}'`
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

function countAttachedClients(session: IsolatedTmuxSession): number {
  try {
    const output = runTmux(session.socketName, [
      'list-clients',
      '-t',
      session.sessionName,
      '-F',
      '#{client_name}',
    ]).stdout.trim()
    if (output.length === 0) return 0
    return output
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0).length
  } catch {
    return 0
  }
}

export async function attachTmuxClient(
  session: IsolatedTmuxSession,
  opts?: { timeoutMs?: number },
): Promise<TmuxAttachedClient> {
  const attachCommand =
    `tmux -L ${shellQuote(session.socketName)} ` +
    `attach-session -t ${shellQuote(session.sessionName)}`
  const env = getTmuxTestEnv()
  if (!env.TERM || env.TERM === 'dumb') {
    env.TERM = 'xterm-256color'
  }
  const process = spawn(
    'script',
    ['-q', '-e', '-f', '-c', attachCommand, '/dev/null'],
    {
      env,
      stdio: 'pipe',
    },
  )

  if (!process.stdin || !process.stdout || !process.stderr) {
    throw new Error('Failed to spawn attached tmux client')
  }

  let attachOutput = ''
  process.stdout.setEncoding('utf8')
  process.stderr.setEncoding('utf8')
  process.stdout.on('data', chunk => {
    attachOutput += chunk
  })
  process.stderr.on('data', chunk => {
    attachOutput += chunk
  })

  const timeoutMs = opts?.timeoutMs ?? 2000
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (process.exitCode !== null) {
      const details =
        attachOutput.trim().length > 0
          ? `: ${attachOutput.trim().replaceAll('\n', ' | ')}`
          : ''
      throw new Error(
        `Attached tmux client exited early (${process.exitCode})${details}`,
      )
    }
    if (countAttachedClients(session) > 0) {
      return { process }
    }
    await delay(20)
  }

  process.kill('SIGTERM')
  throw new Error(
    `Timed out waiting for tmux client attach on socket ${session.socketName}. ` +
      `attach output=${JSON.stringify(attachOutput.trim())}`,
  )
}

export async function sendAttachedClientInput(
  client: TmuxAttachedClient,
  input: string,
  settleMs = 50,
): Promise<void> {
  if (client.process.stdin.destroyed) {
    throw new Error('Attached tmux client stdin is closed')
  }

  await new Promise<void>((resolve, reject) => {
    client.process.stdin.write(input, error => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })

  if (settleMs > 0) {
    await delay(settleMs)
  }
}

function parsePaneMetrics(output: string): Omit<TmuxTraceFrame, 'label' | 'pane'> {
  const [cursorX, cursorY, historySize, paneWidth, paneHeight] = output
    .trim()
    .split(',')

  if (
    cursorX === undefined ||
    cursorY === undefined ||
    historySize === undefined ||
    paneWidth === undefined ||
    paneHeight === undefined
  ) {
    throw new Error(`Unable to parse pane metrics: ${output}`)
  }

  return {
    cursorX: Number.parseInt(cursorX, 10),
    cursorY: Number.parseInt(cursorY, 10),
    historySize: Number.parseInt(historySize, 10),
    paneWidth: Number.parseInt(paneWidth, 10),
    paneHeight: Number.parseInt(paneHeight, 10),
  }
}

export function capturePaneFrame(
  session: IsolatedTmuxSession,
  label: string,
  opts?: PaneCaptureOptions,
): TmuxTraceFrame {
  const pane = capturePane(session, opts)
  const metrics = parsePaneMetrics(
    runTmux(session.socketName, [
      'display-message',
      '-p',
      '-t',
      session.targetPane,
      '#{cursor_x},#{cursor_y},#{history_size},#{pane_width},#{pane_height}',
    ]).stdout,
  )

  return {
    label,
    pane,
    ...metrics,
  }
}

async function waitForProcessExit(
  process: ChildProcessWithoutNullStreams,
  timeoutMs: number,
): Promise<boolean> {
  if (process.exitCode !== null) {
    return true
  }

  return await new Promise<boolean>(resolve => {
    const timeout = setTimeout(() => {
      cleanup()
      resolve(false)
    }, timeoutMs)

    const onExit = () => {
      cleanup()
      resolve(true)
    }

    const cleanup = () => {
      clearTimeout(timeout)
      process.off('exit', onExit)
    }

    process.on('exit', onExit)
  })
}

export async function detachTmuxClient(
  session: IsolatedTmuxSession,
  client: TmuxAttachedClient,
): Promise<void> {
  try {
    runTmux(session.socketName, ['detach-client', '-s', session.sessionName])
  } catch {
    // Best-effort detach; the process may have already exited.
  }

  if (await waitForProcessExit(client.process, 400)) {
    return
  }

  client.process.kill('SIGTERM')
  if (await waitForProcessExit(client.process, 400)) {
    return
  }
  client.process.kill('SIGKILL')
  await waitForProcessExit(client.process, 400)
}

export async function captureAttachedTmuxTrace(
  session: IsolatedTmuxSession,
  steps: readonly TmuxAttachedTraceStep[],
  opts?: CaptureAttachedTmuxTraceOptions,
): Promise<TmuxTraceFrame[]> {
  const client = await attachTmuxClient(session, {
    timeoutMs: opts?.attachTimeoutMs,
  })

  try {
    const initialDelayMs = opts?.initialDelayMs ?? 0
    if (initialDelayMs > 0) {
      await delay(initialDelayMs)
    }

    const frames: TmuxTraceFrame[] = []
    if (opts?.captureInitial ?? true) {
      frames.push(
        capturePaneFrame(
          session,
          opts?.initialLabel ?? 'initial',
          opts?.paneCapture,
        ),
      )
    }

    for (const step of steps) {
      if (step.input !== undefined && step.input.length > 0) {
        await sendAttachedClientInput(client, step.input, step.settleMs ?? 50)
      } else {
        const settleMs = step.settleMs ?? 0
        if (settleMs > 0) {
          await delay(settleMs)
        }
      }

      if (step.capture ?? true) {
        frames.push(capturePaneFrame(session, step.label, opts?.paneCapture))
      }
    }

    return frames
  } finally {
    await detachTmuxClient(session, client)
  }
}
