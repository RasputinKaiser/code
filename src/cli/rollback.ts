import chalk from 'chalk'
import { homedir } from 'os'
import { getVersionHistory, getMaxVersion } from '../utils/autoUpdater.js'
import { logForDebugging } from '../utils/debug.js'
import { execFileNoThrowWithCwd } from '../utils/execFileNoThrow.js'
import { gracefulShutdown } from '../utils/gracefulShutdown.js'
import { installLatest } from '../utils/nativeInstaller/installer.js'
import { writeToStderr, writeToStdout } from '../utils/process.js'

const DEFAULT_VERSION_HISTORY_LIMIT = 25
const TARGET_RESOLUTION_HISTORY_LIMIT = 250

type RollbackOptions = {
  list?: boolean
  dryRun?: boolean
  safe?: boolean
}

function formatAge(timestamp: string | undefined): string {
  if (!timestamp) {
    return 'unknown age'
  }

  const publishedAt = new Date(timestamp)
  if (Number.isNaN(publishedAt.getTime())) {
    return 'unknown age'
  }

  const deltaMs = Math.max(0, Date.now() - publishedAt.getTime())
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  const month = 30 * day

  if (deltaMs < hour) {
    return `${Math.max(1, Math.floor(deltaMs / minute))}m ago`
  }
  if (deltaMs < day) {
    return `${Math.floor(deltaMs / hour)}h ago`
  }
  if (deltaMs < month) {
    return `${Math.floor(deltaMs / day)}d ago`
  }
  return `${Math.floor(deltaMs / month)}mo ago`
}

async function getVersionPublishTimes(): Promise<Record<string, string>> {
  const packageUrl = MACRO.NATIVE_PACKAGE_URL ?? MACRO.PACKAGE_URL
  const result = await execFileNoThrowWithCwd(
    'npm',
    ['view', packageUrl, 'time', '--json', '--prefer-online'],
    {
      cwd: homedir(),
      timeout: 30_000,
    },
  )

  if (result.code !== 0) {
    logForDebugging(`rollback: failed to load version publish times: ${result.stderr}`)
    return {}
  }

  try {
    const parsed = JSON.parse(result.stdout) as Record<string, string>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (error) {
    logForDebugging(`rollback: failed to parse version publish times: ${String(error)}`)
    return {}
  }
}

async function listVersions(): Promise<void> {
  const [versions, publishTimes] = await Promise.all([
    getVersionHistory(DEFAULT_VERSION_HISTORY_LIMIT),
    getVersionPublishTimes(),
  ])

  if (versions.length === 0) {
    writeToStderr('No published versions found.\n')
    await gracefulShutdown(1)
    return
  }

  const versionWidth = Math.max(...versions.map(version => version.length))

  writeToStdout(`Current version: ${MACRO.VERSION}\n\n`)
  versions.forEach((version, index) => {
    const age = formatAge(publishTimes[version])
    const current = version === MACRO.VERSION ? ' (current)' : ''
    writeToStdout(
      `${String(index).padStart(2)}  ${version.padEnd(versionWidth)}  ${age}${current}\n`,
    )
  })

  await gracefulShutdown(0)
}

async function resolveRollbackTarget(
  target: string | undefined,
  options: RollbackOptions,
): Promise<string> {
  if (options.safe) {
    const safeVersion = await getMaxVersion()
    if (!safeVersion) {
      throw new Error('No safe rollback version is currently configured.')
    }
    return safeVersion
  }

  if (target && /^\d+$/.test(target)) {
    const stepsBack = Number.parseInt(target, 10)
    const history = await getVersionHistory(TARGET_RESOLUTION_HISTORY_LIMIT)
    if (history.length === 0) {
      throw new Error('Unable to load version history for rollback.')
    }

    const currentIndex = history.indexOf(MACRO.VERSION)
    if (currentIndex === -1) {
      throw new Error(
        `Current version ${MACRO.VERSION} was not found in the recent version history.`,
      )
    }

    const targetIndex = currentIndex + stepsBack
    if (targetIndex >= history.length) {
      throw new Error(
        `Only ${history.length - currentIndex - 1} older version(s) are available from the recent history window.`,
      )
    }

    return history[targetIndex]!
  }

  if (target) {
    return target
  }

  const history = await getVersionHistory(TARGET_RESOLUTION_HISTORY_LIMIT)
  if (history.length === 0) {
    throw new Error('Unable to load version history for rollback.')
  }

  const currentIndex = history.indexOf(MACRO.VERSION)
  if (currentIndex === -1) {
    throw new Error(
      `Current version ${MACRO.VERSION} was not found in the recent version history.`,
    )
  }

  const targetIndex = currentIndex + 1
  if (targetIndex >= history.length) {
    throw new Error('No older published version is available to roll back to.')
  }

  return history[targetIndex]!
}

export async function rollback(
  target: string | undefined,
  options: RollbackOptions = {},
): Promise<void> {
  try {
    if (options.list) {
      await listVersions()
      return
    }

    const resolvedTarget = await resolveRollbackTarget(target, options)
    if (options.dryRun) {
      writeToStdout(
        `Would roll back from ${MACRO.VERSION} to ${resolvedTarget}.\n`,
      )
      await gracefulShutdown(0)
      return
    }

    writeToStdout(
      chalk.yellow(`Rolling back from ${MACRO.VERSION} to ${resolvedTarget}...`) +
        '\n',
    )

    const result = await installLatest(resolvedTarget, false)
    if (result.lockFailed) {
      const pidInfo = result.lockHolderPid
        ? ` (PID ${result.lockHolderPid})`
        : ''
      writeToStderr(
        `Another Code process${pidInfo} is currently running. Please try again in a moment.\n`,
      )
      await gracefulShutdown(1)
      return
    }

    if (!result.latestVersion) {
      writeToStderr('Rollback failed: unable to install the requested version.\n')
      await gracefulShutdown(1)
      return
    }

    if (result.latestVersion === MACRO.VERSION) {
      writeToStdout(
        chalk.yellow(`Already running ${result.latestVersion}.`) + '\n',
      )
      await gracefulShutdown(0)
      return
    }

    writeToStdout(
      chalk.green(`Rolled back to ${result.latestVersion}.`) + '\n',
    )
    await gracefulShutdown(0)
  } catch (error) {
    writeToStderr(`Rollback failed: ${error instanceof Error ? error.message : String(error)}\n`)
    await gracefulShutdown(1)
  }
}
