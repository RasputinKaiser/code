import axios from 'axios'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  getCwdState,
  getOriginalCwd,
  setCwdState,
  setOriginalCwd,
} from '../../bootstrap/state.js'
import {
  buildDownloadPath,
  downloadAndSaveFile,
  listFilesCreatedAfter,
  parseFileSpecs,
  uploadFile,
} from './filesApi.js'

const config = {
  oauthToken: 'session-token',
  baseUrl: 'https://api.noumena.test',
  sessionId: 'session_123',
}

let tempRoot = ''
let originalCwdState = ''
let originalOriginalCwd = ''

const originalAxiosGet = axios.get
const originalAxiosPost = axios.post

beforeAll(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), 'ncode-files-api-test-'))
  originalCwdState = getCwdState()
  originalOriginalCwd = getOriginalCwd()
})

beforeEach(() => {
  axios.get = originalAxiosGet
  axios.post = originalAxiosPost
  setCwdState(tempRoot)
  setOriginalCwd(tempRoot)
})

afterEach(() => {
  axios.get = originalAxiosGet
  axios.post = originalAxiosPost
  setCwdState(originalCwdState)
  setOriginalCwd(originalOriginalCwd)
})

afterAll(async () => {
  await rm(tempRoot, { recursive: true, force: true })
})

describe('filesApi', () => {
  it('buildDownloadPath rejects traversal and strips redundant uploads prefixes', () => {
    expect(buildDownloadPath('/workspace', 'session_123', '../secret.txt')).toBe(
      null,
    )
    expect(
      buildDownloadPath(
        '/workspace',
        'session_123',
        '/uploads/nested/report.txt',
      ),
    ).toBe('/workspace/session_123/uploads/nested/report.txt')
    expect(
      buildDownloadPath(
        '/workspace',
        'session_123',
        '/workspace/session_123/uploads/nested/report.txt',
      ),
    ).toBe('/workspace/session_123/uploads/nested/report.txt')
  })

  it('downloadAndSaveFile writes the downloaded bytes under the session uploads directory', async () => {
    axios.get = (async (url: string, options?: unknown) => {
      expect(url).toBe('https://api.noumena.test/v1/files/file_abc/content')
      expect(options).toMatchObject({
        headers: {
          Authorization: 'Bearer session-token',
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'files-api-2025-04-14,oauth-2025-04-20',
        },
      })
      return {
        status: 200,
        data: Buffer.from('hello world'),
      }
    }) as typeof axios.get

    const result = await downloadAndSaveFile(
      {
        fileId: 'file_abc',
        relativePath: 'docs/readme.txt',
      },
      config,
    )

    expect(result).toEqual({
      fileId: 'file_abc',
      path: join(tempRoot, 'session_123', 'uploads', 'docs', 'readme.txt'),
      success: true,
      bytesWritten: 11,
    })
    expect(await readFile(result.path, 'utf8')).toBe('hello world')
  })

  it('uploadFile returns a non-retriable failure for 413 responses without retrying', async () => {
    const sourceFile = join(tempRoot, 'bundle.bin')
    await writeFile(sourceFile, 'payload')

    const calls: Array<{ url: string; headers?: Record<string, string> }> = []
    axios.post = (async (url: string, body: unknown, options?: unknown) => {
      calls.push({
        url,
        headers: (options as { headers?: Record<string, string> } | undefined)
          ?.headers,
      })
      expect(Buffer.isBuffer(body)).toBe(true)
      return {
        status: 413,
        data: {},
      }
    }) as typeof axios.post

    const result = await uploadFile(sourceFile, 'nested/bundle.bin', config)

    expect(result).toEqual({
      path: 'nested/bundle.bin',
      error: 'File too large for upload',
      success: false,
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      url: 'https://api.noumena.test/v1/files',
      headers: {
        Authorization: 'Bearer session-token',
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'files-api-2025-04-14,oauth-2025-04-20',
      },
    })
    expect(calls[0].headers?.['Content-Type']).toStartWith(
      'multipart/form-data; boundary=',
    )
  })

  it('listFilesCreatedAfter paginates with after_id and maps file metadata', async () => {
    const calls: Array<{
      url: string
      params?: Record<string, string>
      headers?: Record<string, string>
    }> = []
    axios.get = (async (url: string, options?: unknown) => {
      const request = options as
        | {
            params?: Record<string, string>
            headers?: Record<string, string>
          }
        | undefined
      calls.push({
        url,
        params: request?.params,
        headers: request?.headers,
      })

      if (!request?.params?.after_id) {
        return {
          status: 200,
          data: {
            data: [
              { id: 'file_1', filename: 'first.txt', size_bytes: 10 },
              { id: 'file_2', filename: 'second.txt', size_bytes: 20 },
            ],
            has_more: true,
          },
        }
      }

      return {
        status: 200,
        data: {
          data: [{ id: 'file_3', filename: 'third.txt', size_bytes: 30 }],
          has_more: false,
        },
      }
    }) as typeof axios.get

    const results = await listFilesCreatedAfter(
      '2026-01-01T00:00:00.000Z',
      config,
    )

    expect(results).toEqual([
      { filename: 'first.txt', fileId: 'file_1', size: 10 },
      { filename: 'second.txt', fileId: 'file_2', size: 20 },
      { filename: 'third.txt', fileId: 'file_3', size: 30 },
    ])
    expect(calls).toEqual([
      {
        url: 'https://api.noumena.test/v1/files',
        params: { after_created_at: '2026-01-01T00:00:00.000Z' },
        headers: {
          Authorization: 'Bearer session-token',
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'files-api-2025-04-14,oauth-2025-04-20',
        },
      },
      {
        url: 'https://api.noumena.test/v1/files',
        params: {
          after_created_at: '2026-01-01T00:00:00.000Z',
          after_id: 'file_2',
        },
        headers: {
          Authorization: 'Bearer session-token',
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'files-api-2025-04-14,oauth-2025-04-20',
        },
      },
    ])
  })

  it('parseFileSpecs expands gateway-packed specs and skips malformed entries', () => {
    expect(
      parseFileSpecs([
        'file_1:docs/a.txt file_2:docs/b.txt',
        'missing-colon',
        'file_3:',
        ':missing-file-id',
        'file_4:dir:with:colons.txt',
      ]),
    ).toEqual([
      { fileId: 'file_1', relativePath: 'docs/a.txt' },
      { fileId: 'file_2', relativePath: 'docs/b.txt' },
      { fileId: 'file_4', relativePath: 'dir:with:colons.txt' },
    ])
  })
})
