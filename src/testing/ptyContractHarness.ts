import { spawnSync } from 'child_process'
import stripAnsi from 'strip-ansi'
import { readVisibleRows } from './replScreenContractHarness.js'

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
}

export type PtyContractSession = {
  readonly proc: Bun.Subprocess<'pipe', 'pipe', 'pipe'>
  readonly finished: Promise<{
    readonly exitCode: number
    readonly stdout: string
    readonly stderr: string
  }>
  getRawText: () => string
  getVisibleText: () => string
  waitForRawText: (
    regex: RegExp,
    timeoutMs: number,
    label: string,
  ) => Promise<RegExpMatchArray>
  waitForVisibleText: (
    predicate: (text: string) => boolean,
    timeoutMs: number,
    label: string,
  ) => Promise<string>
  waitForVisibleRows: (
    predicate: (rows: string[]) => boolean,
    timeoutMs: number,
    label: string,
  ) => Promise<string[]>
  send: (text: string) => void
  terminate: () => void
}

const DEFAULT_COLUMNS = '120'
const DEFAULT_LINES = '40'
const PRIVATE_MODE_CSI_RE = /\x1b\[[<>][0-9;]*[A-Za-z~]/g
const DCS_SEQUENCE_RE = /\x1bP[\s\S]*?(?:\x07|\x1b\\)/g
const OSC_SEQUENCE_RE = /\x1b\][\s\S]*?(?:\x07|\x1b\\)/g
const CARRIAGE_RETURN_RE = /\r(?!\n)/g

const TERMINAL_IDENTITY_ENV_VARS = [
  'TMUX',
  'STY',
  'TERM_PROGRAM',
  'TERM_PROGRAM_VERSION',
  'KITTY_WINDOW_ID',
  'KITTY_INSTALLATION_DIR',
  'GHOSTTY_RESOURCES_DIR',
  'WT_SESSION',
  'VSCODE_GIT_ASKPASS_MAIN',
  '__CFBundleIdentifier',
  'KONSOLE_VERSION',
  'GNOME_TERMINAL_SERVICE',
  'XTERM_VERSION',
  'VTE_VERSION',
  'TERMINATOR_UUID',
  'ALACRITTY_LOG',
  'TILIX_ID',
  'TERMINAL_EMULATOR',
  'WSL_DISTRO_NAME',
] as const

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function shellQuoteArg(value: string): string {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`
}

function shellJoinArgs(args: readonly string[]): string {
  return args.map(shellQuoteArg).join(' ')
}

function createDeterministicPtyEnv(
  envOverrides?: NodeJS.ProcessEnv,
  columns = DEFAULT_COLUMNS,
  lines = DEFAULT_LINES,
): NodeJS.ProcessEnv {
  const env = {
    ...process.env,
    ...envOverrides,
  }

  for (const key of TERMINAL_IDENTITY_ENV_VARS) {
    delete env[key]
  }

  env.TERM = envOverrides?.TERM || 'xterm-256color'
  env.COLUMNS = envOverrides?.COLUMNS || columns
  env.LINES = envOverrides?.LINES || lines
  env.SUPERCONSOLE_TESTING_WIDTH =
    envOverrides?.SUPERCONSOLE_TESTING_WIDTH || columns
  env.SUPERCONSOLE_TESTING_HEIGHT =
    envOverrides?.SUPERCONSOLE_TESTING_HEIGHT || lines

  return env
}

export function normalizePtyVisibleText(rawText: string): string {
  return stripAnsi(
    rawText
      .replace(DCS_SEQUENCE_RE, '')
      .replace(OSC_SEQUENCE_RE, '')
      .replace(PRIVATE_MODE_CSI_RE, '')
      .replace(CARRIAGE_RETURN_RE, '\n'),
  )
}

function resolveScriptBinary(): string | null {
  const scriptPath = Bun.which('script')
  return scriptPath ?? null
}

export function isPtyAvailableForTests(): boolean {
  const scriptPath = resolveScriptBinary()
  if (!scriptPath) {
    return false
  }

  const result = spawnSync(scriptPath, ['-qefc', 'printf ready', '/dev/null'], {
    env: createDeterministicPtyEnv(undefined, DEFAULT_COLUMNS, DEFAULT_LINES),
    encoding: 'utf8',
  })

  return result.status === 0 && (result.stdout || '').includes('ready')
}

export function spawnPtyContractSession(
  commandArgs: readonly string[],
  options?: {
    readonly cwd?: string
    readonly env?: NodeJS.ProcessEnv
    readonly columns?: number
    readonly lines?: number
  },
): PtyContractSession {
  const scriptPath = resolveScriptBinary()
  if (!scriptPath) {
    throw new Error('required command not found: script')
  }

  const columns = String(options?.columns ?? Number(DEFAULT_COLUMNS))
  const lines = String(options?.lines ?? Number(DEFAULT_LINES))
  const proc = Bun.spawn(
    [scriptPath, '-qefc', shellJoinArgs(commandArgs), '/dev/null'],
    {
      cwd: options?.cwd,
      env: createDeterministicPtyEnv(options?.env, columns, lines),
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    },
  )

  let rawText = ''
  let visibleText = ''
  const waiters: Array<{
    readonly regex: RegExp
    readonly resolve: (match: RegExpMatchArray) => void
    readonly reject: (error: Error) => void
    readonly timer: ReturnType<typeof setTimeout>
  }> = []

  function maybeResolveWaiters(): void {
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      const waiter = waiters[index]
      const match = rawText.match(waiter.regex)
      if (!match) {
        continue
      }
      clearTimeout(waiter.timer)
      waiters.splice(index, 1)
      waiter.resolve(match)
    }
  }

  async function drainStream(
    stream: ReadableStream<Uint8Array>,
    onChunk: (chunk: string) => void,
  ): Promise<string> {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let text = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        const chunk = decoder.decode()
        if (chunk.length > 0) {
          text += chunk
          onChunk(chunk)
        }
        return text
      }

      const chunk = decoder.decode(value, { stream: true })
      text += chunk
      onChunk(chunk)
    }
  }

  function onText(chunk: string): void {
    rawText += chunk
    visibleText = normalizePtyVisibleText(rawText)

    const cursorQueries = chunk.match(/\x1b\[6n/g)?.length || 0
    for (let index = 0; index < cursorQueries; index += 1) {
      proc.stdin.write('\x1b[1;1R')
    }

    maybeResolveWaiters()
  }

  const stdoutDone = drainStream(proc.stdout, onText)
  const stderrDone = drainStream(proc.stderr, onText)

  const finished = (async () => {
    const exitCode = await proc.exited
    const [stdout, stderr] = await Promise.all([stdoutDone, stderrDone])
    return {
      exitCode,
      stdout,
      stderr,
    }
  })()

  return {
    proc,
    finished,
    getRawText() {
      return rawText
    },
    getVisibleText() {
      return visibleText
    },
    waitForRawText(regex, timeoutMs, label) {
      const match = rawText.match(regex)
      if (match) {
        return Promise.resolve(match)
      }

      const deferred = createDeferred<RegExpMatchArray>()
      const timer = setTimeout(() => {
        const waiterIndex = waiters.findIndex(waiter => waiter.timer === timer)
        if (waiterIndex !== -1) {
          waiters.splice(waiterIndex, 1)
        }
        deferred.reject(
          new Error(
            `Timed out waiting for ${label} after ${timeoutMs}ms. Current PTY output:\n${rawText}`,
          ),
        )
      }, timeoutMs)

      waiters.push({
        regex,
        resolve: deferred.resolve,
        reject: deferred.reject,
        timer,
      })
      return deferred.promise
    },
    async waitForVisibleText(predicate, timeoutMs, label) {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        if (predicate(visibleText)) {
          return visibleText
        }
        await Bun.sleep(20)
      }

      throw new Error(
        `Timed out waiting for ${label} after ${timeoutMs}ms. Current visible PTY output:\n${visibleText}`,
      )
    },
    async waitForVisibleRows(predicate, timeoutMs, label) {
      const visibleTextSnapshot = await this.waitForVisibleText(
        text => predicate(readVisibleRows(text)),
        timeoutMs,
        label,
      )
      return readVisibleRows(visibleTextSnapshot)
    },
    send(text) {
      proc.stdin.write(text)
    },
    terminate() {
      try {
        proc.stdin.end()
      } catch {}

      try {
        proc.kill('SIGTERM')
      } catch {}

      setTimeout(() => {
        try {
          proc.kill('SIGKILL')
        } catch {}
      }, 250)
    },
  }
}
