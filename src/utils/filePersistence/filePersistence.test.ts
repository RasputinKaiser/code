import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { resetStateForTests } from '../../bootstrap/state.js'
import { runWithCwdOverride } from '../cwd.js'
import { updateSessionIngressRuntimeAuth } from '../sessionIngressAuth.js'

const uploadState = {
  calls: [] as Array<{
    config: { oauthToken: string; sessionId: string }
    files: Array<{ path: string; relativePath: string }>
  }>,
}

const filesApiPaths = [
  import.meta.resolve('../../services/api/filesApi.ts'),
  import.meta.resolve('../../services/api/filesApi.js'),
]

const actualFilesApiModule = await import(
  import.meta.resolve('../../services/api/filesApi.ts')
)

for (const filesApiPath of filesApiPaths) {
  mock.module(filesApiPath, () => ({
    ...actualFilesApiModule,
    async uploadSessionFiles(
      files: Array<{ path: string; relativePath: string }>,
      config: { oauthToken: string; sessionId: string },
    ) {
      uploadState.calls.push({ config, files })
      return files.map(file => ({
        success: true,
        path: file.path,
        fileId: `file:${file.relativePath}`,
      }))
    },
  }))
}

const filePersistenceModule = await import(import.meta.resolve('./filePersistence.ts'))
const { runFilePersistence } = filePersistenceModule

let tempDir = ''

const envKeys = [
  'NODE_ENV',
  'CLAUDE_CODE_ENVIRONMENT_KIND',
  'CLAUDE_CODE_REMOTE_SESSION_ID',
  'CLAUDE_CODE_SESSION_ACCESS_TOKEN',
  'NCODE_SESSION_INGRESS_LEASE_ID',
  'NCODE_SESSION_INGRESS_LEASE_KIND',
  'NCODE_SESSION_INGRESS_LEASE_STATE',
  'NCODE_SESSION_INGRESS_LEASE_EXECUTION_TARGET',
  'NCODE_SESSION_INGRESS_LEASE_PROVIDER_MODE',
  'NCODE_SESSION_INGRESS_LEASE_RENEWABLE',
  'NCODE_SESSION_INGRESS_LEASE_RENEWAL_OWNER',
  'NCODE_SESSION_INGRESS_LEASE_TOKEN_TRANSPORT',
  'NCODE_SESSION_INGRESS_LEASE_ORGANIZATION_UUID',
] as const

const originalEnv = Object.fromEntries(
  envKeys.map(key => [key, process.env[key]]),
) as Record<(typeof envKeys)[number], string | undefined>

function restoreEnvVar(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
}

function restoreEnv(): void {
  for (const key of envKeys) {
    restoreEnvVar(key, originalEnv[key])
  }
}

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'ncode-file-persistence-test-'))
})

beforeEach(() => {
  restoreEnv()
  process.env.NODE_ENV = 'test'
  process.env.CLAUDE_CODE_ENVIRONMENT_KIND = 'byoc'
  process.env.CLAUDE_CODE_REMOTE_SESSION_ID = 'session-1'
  uploadState.calls = []
  resetStateForTests()
})

afterEach(() => {
  restoreEnv()
  uploadState.calls = []
  resetStateForTests()
})

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

describe('file persistence session-ingress lease gating', () => {
  it('returns null when no session-ingress lease is available', async () => {
    const result = await runWithCwdOverride(tempDir, () =>
      runFilePersistence(Date.now() - 1000),
    )

    expect(result).toBeNull()
    expect(uploadState.calls).toHaveLength(0)
  })

  it('uploads modified BYOC output files when explicit session-ingress runtime auth is present', async () => {
    const sessionDir = join(tempDir, 'session-1', 'outputs')
    await mkdir(sessionDir, { recursive: true })
    const filePath = join(sessionDir, 'artifact.txt')
    await writeFile(filePath, 'hello', 'utf8')

    updateSessionIngressRuntimeAuth({
      executionTarget: 'remote',
      organizationUuid: 'org-1',
      sessionId: 'session-1',
      token: 'lease-token',
    })

    const result = await runWithCwdOverride(tempDir, () =>
      runFilePersistence(Date.now() - 1000),
    )

    expect(uploadState.calls).toHaveLength(1)
    expect(uploadState.calls[0]).toMatchObject({
      config: {
        oauthToken: 'lease-token',
        sessionId: 'session-1',
      },
      files: [
        {
          path: filePath,
          relativePath: 'artifact.txt',
        },
      ],
    })
    expect(result).toEqual({
      files: [
        {
          filename: filePath,
          file_id: 'file:artifact.txt',
        },
      ],
      failed: [],
    })
  })
})
