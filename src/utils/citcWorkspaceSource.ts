import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { getCwd } from './cwd.js'
import { logForDebugging } from './debug.js'
import { execFileNoThrow } from './execFileNoThrow.js'
import type { NoumenaWorkspaceSource } from './teleport/api.js'

const COMMIT_CLOUD_RC_CANDIDATES = ['.hg/commitcloudrc', '.sl/commitcloudrc']
const SAPLING_CONFIG_CANDIDATES = ['.hg/hgrc', '.sl/config']

export function encodeWorkspaceId(
  repo: string,
  rawWorkspaceName: string,
): string {
  return Buffer.from(`${repo}\u0000${rawWorkspaceName}`, 'utf8').toString(
    'base64url',
  )
}

export function parseCommitCloudRc(contents: string): {
  rawWorkspaceName: string
  locallyOwned: boolean | null
} | null {
  const rawWorkspaceName = contents
    .split(/\r?\n/u)
    .map(line => line.trim())
    .find(line => line.startsWith('current_workspace='))
    ?.slice('current_workspace='.length)
    .trim()

  if (!rawWorkspaceName) {
    return null
  }

  const locallyOwnedValue = contents
    .split(/\r?\n/u)
    .map(line => line.trim())
    .find(line => line.startsWith('locally_owned='))
    ?.slice('locally_owned='.length)
    .trim()
    .toLowerCase()

  return {
    rawWorkspaceName,
    locallyOwned:
      locallyOwnedValue === 'true'
        ? true
        : locallyOwnedValue === 'false'
          ? false
          : null,
  }
}

export function parseSaplingRepoName(contents: string): string | null {
  const lines = contents.split(/\r?\n/u).map(line => line.trim())
  const explicitRepoName = lines
    .find(line => line.startsWith('reponame='))
    ?.slice('reponame='.length)
    .trim()
  if (explicitRepoName) {
    return explicitRepoName
  }

  const monoDefault = lines
    .find(line => line.startsWith('default=mono:'))
    ?.slice('default=mono:'.length)
    .trim()
  return monoDefault || null
}

export function parseWorkspaceStatus(output: string): {
  rawWorkspaceName: string | null
  workspaceVersion: number | null
  workspaceState: string | null
} {
  const lines = output.split(/\r?\n/u).map(line => line.trim())
  const rawWorkspaceName =
    lines
      .find(line => line.startsWith('Raw Workspace Name: '))
      ?.slice('Raw Workspace Name: '.length)
      .trim() || null
  const workspaceState =
    lines
      .find(line => line.startsWith('Workspace State: '))
      ?.slice('Workspace State: '.length)
      .trim() || null
  const versionText =
    lines
      .find(line => line.startsWith('Workspace Version: '))
      ?.slice('Workspace Version: '.length)
      .trim() || null

  const parsedVersion =
    versionText && /^\d+$/u.test(versionText) ? Number(versionText) : null

  return {
    rawWorkspaceName,
    workspaceVersion: parsedVersion,
    workspaceState,
  }
}

async function readTextIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

async function findFirstExistingPath(
  repoRoot: string,
  candidates: string[],
): Promise<string | null> {
  for (const candidate of candidates) {
    const fullPath = join(repoRoot, candidate)
    if ((await readTextIfExists(fullPath)) !== null) {
      return fullPath
    }
  }
  return null
}

export async function findSaplingWorkspaceRoot(
  startPath: string,
): Promise<string | null> {
  let current = resolve(startPath)

  while (true) {
    for (const candidate of COMMIT_CLOUD_RC_CANDIDATES) {
      if ((await readTextIfExists(join(current, candidate))) !== null) {
        return current
      }
    }

    const parent = dirname(current)
    if (parent === current) {
      return null
    }
    current = parent
  }
}

async function getCloudStatusViaSapling(repoRoot: string): Promise<string | null> {
  const candidates = [process.env.NCODE_HG_BINARY, 'sl'].filter(
    (candidate): candidate is string => Boolean(candidate),
  )

  for (const candidate of candidates) {
    const result = await execFileNoThrow(
      candidate,
      ['-R', repoRoot, 'cloud', 'status'],
      {
        useCwd: false,
        timeout: 15_000,
      },
    )

    if (result.code === 0) {
      const output = result.stdout.trim() || result.stderr.trim()
      if (output) {
        return output
      }
    }
  }

  return null
}

export async function detectCitcWorkspaceSourceForPath(
  startPath: string,
  options?: {
    getCloudStatus?: (repoRoot: string) => Promise<string | null>
  },
): Promise<NoumenaWorkspaceSource | null> {
  const repoRoot = await findSaplingWorkspaceRoot(startPath)
  if (!repoRoot) {
    return null
  }

  const commitCloudRcPath = await findFirstExistingPath(
    repoRoot,
    COMMIT_CLOUD_RC_CANDIDATES,
  )
  if (!commitCloudRcPath) {
    return null
  }

  const commitCloudRc = await readTextIfExists(commitCloudRcPath)
  if (!commitCloudRc) {
    return null
  }

  const parsedWorkspace = parseCommitCloudRc(commitCloudRc)
  if (!parsedWorkspace) {
    return null
  }

  const saplingConfigPath = await findFirstExistingPath(
    repoRoot,
    SAPLING_CONFIG_CANDIDATES,
  )
  if (!saplingConfigPath) {
    return null
  }

  const saplingConfig = await readTextIfExists(saplingConfigPath)
  const repo = saplingConfig ? parseSaplingRepoName(saplingConfig) : null
  if (!repo) {
    return null
  }

  let rawWorkspaceName = parsedWorkspace.rawWorkspaceName
  let workspaceVersion: number | null = null
  let workspaceState: string | null = null

  const cloudStatus = await (options?.getCloudStatus ??
    getCloudStatusViaSapling)(repoRoot)
  if (cloudStatus) {
    const parsedStatus = parseWorkspaceStatus(cloudStatus)
    if (
      parsedStatus.rawWorkspaceName &&
      parsedStatus.rawWorkspaceName !== rawWorkspaceName
    ) {
      logForDebugging(
        `[citcWorkspaceSource] commitcloudrc workspace ${rawWorkspaceName} disagrees with cloud status ${parsedStatus.rawWorkspaceName}; preferring cloud status`,
      )
    }
    rawWorkspaceName = parsedStatus.rawWorkspaceName || rawWorkspaceName
    workspaceVersion = parsedStatus.workspaceVersion
    workspaceState = parsedStatus.workspaceState
  }

  return {
    type: 'noumena_workspace',
    workspace_id: encodeWorkspaceId(repo, rawWorkspaceName),
    repo,
    raw_workspace_name: rawWorkspaceName,
    checkout_path: repoRoot,
    ...(workspaceVersion !== null && { workspace_version: workspaceVersion }),
    ...(workspaceState !== null && { workspace_state: workspaceState }),
  }
}

export async function detectCurrentCitcWorkspaceSource(): Promise<NoumenaWorkspaceSource | null> {
  return detectCitcWorkspaceSourceForPath(getCwd())
}
