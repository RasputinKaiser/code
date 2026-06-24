import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'
import axios from 'axios'
import { mkdtemp, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { getSessionId } from '../bootstrap/state.js'
import {
  extractInboundAttachments,
  prependPathRefs,
  resolveAndPrepend,
  resolveInboundAttachments,
} from './inboundAttachments.js'

let configDir: string
const originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR
const originalNcodeConfigDir = process.env.NCODE_CONFIG_DIR
const originalBridgeToken = process.env.CLAUDE_BRIDGE_OAUTH_TOKEN
const originalBridgeBaseUrl = process.env.CLAUDE_BRIDGE_BASE_URL
const originalUserType = process.env.USER_TYPE
const originalAxiosGet = axios.get

beforeEach(async () => {
  configDir = await mkdtemp(join(tmpdir(), 'bridge-inbound-attachments-'))
  process.env.CLAUDE_CONFIG_DIR = configDir
  process.env.NCODE_CONFIG_DIR = configDir
  process.env.USER_TYPE = 'ant'
  process.env.CLAUDE_BRIDGE_OAUTH_TOKEN = 'bridge-test-token'
  process.env.CLAUDE_BRIDGE_BASE_URL = 'https://bridge.example'
})

afterEach(async () => {
  axios.get = originalAxiosGet

  if (originalClaudeConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir
  }

  if (originalNcodeConfigDir === undefined) {
    delete process.env.NCODE_CONFIG_DIR
  } else {
    process.env.NCODE_CONFIG_DIR = originalNcodeConfigDir
  }

  if (originalBridgeToken === undefined) {
    delete process.env.CLAUDE_BRIDGE_OAUTH_TOKEN
  } else {
    process.env.CLAUDE_BRIDGE_OAUTH_TOKEN = originalBridgeToken
  }

  if (originalBridgeBaseUrl === undefined) {
    delete process.env.CLAUDE_BRIDGE_BASE_URL
  } else {
    process.env.CLAUDE_BRIDGE_BASE_URL = originalBridgeBaseUrl
  }

  if (originalUserType === undefined) {
    delete process.env.USER_TYPE
  } else {
    process.env.USER_TYPE = originalUserType
  }

  await rm(configDir, { recursive: true, force: true })
})

describe('inboundAttachments', () => {
  it('accepts only validated file attachment arrays from inbound messages', () => {
    expect(
      extractInboundAttachments({
        file_attachments: [{ file_uuid: 'file-1', file_name: 'notes.txt' }],
      }),
    ).toEqual([{ file_uuid: 'file-1', file_name: 'notes.txt' }])

    expect(
      extractInboundAttachments({
        file_attachments: [{ file_uuid: 'file-2', file_name: 42 }],
      }),
    ).toEqual([])

    expect(extractInboundAttachments({ message: { content: 'hello' } })).toEqual(
      [],
    )
  })

  it('returns an empty prefix when the bridge file fetch fails', async () => {
    const requests: string[] = []
    axios.get = (async (url: string) => {
      requests.push(url)
      return { status: 404, data: new Uint8Array() } as never
    }) as typeof axios.get

    const prefix = await resolveInboundAttachments([
      { file_uuid: 'file-404', file_name: 'missing.txt' },
    ])

    expect(prefix).toBe('')
    expect(requests).toEqual([
      'https://bridge.example/api/oauth/files/file-404/content',
    ])
  })

  it('downloads attachments into the session uploads dir and returns quoted @path refs', async () => {
    const requests: Array<{ url: string; authHeader: string | undefined }> = []
    axios.get = (async (url: string, options?: { headers?: Record<string, string> }) => {
      requests.push({
        url,
        authHeader: options?.headers?.Authorization,
      })
      return {
        status: 200,
        data: Buffer.from('ABC'),
      } as never
    }) as typeof axios.get

    const prefix = await resolveInboundAttachments([
      {
        file_uuid: 'abcd1234-ffff',
        file_name: '../../my report?.pdf',
      },
    ])

    const outPath = join(
      configDir,
      'uploads',
      getSessionId(),
      'abcd1234-my_report_.pdf',
    )

    expect(prefix).toBe(`@"${outPath}" `)
    expect(requests).toEqual([
      {
        url: 'https://bridge.example/api/oauth/files/abcd1234-ffff/content',
        authHeader: 'Bearer bridge-test-token',
      },
    ])
    expect(await readFile(outPath, 'utf8')).toBe('ABC')
  })

  it('appends a trailing text block when content has no text block to update', () => {
    const imageOnlyContent: ContentBlockParam[] = [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=',
        },
      } as never,
    ]

    expect(prependPathRefs(imageOnlyContent, '@"/tmp/example.txt" ')).toEqual([
      imageOnlyContent[0],
      { type: 'text', text: '@"/tmp/example.txt"' },
    ])
  })

  it('prepends resolved refs onto the last text block of mixed content', async () => {
    axios.get = (async () => {
      return {
        status: 200,
        data: Buffer.from('notes'),
      } as never
    }) as typeof axios.get

    const content: ContentBlockParam[] = [
      { type: 'text', text: 'earlier context' },
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=',
        },
      } as never,
      { type: 'text', text: 'describe this upload' },
    ]

    const result = (await resolveAndPrepend(
      {
        file_attachments: [{ file_uuid: 'feedbeef-1111', file_name: 'notes.md' }],
      },
      content,
    )) as ContentBlockParam[]

    const outPath = join(
      configDir,
      'uploads',
      getSessionId(),
      'feedbeef-notes.md',
    )

    expect(result).toEqual([
      content[0],
      content[1],
      {
        type: 'text',
        text: `@"${outPath}" describe this upload`,
      },
    ])
    expect(await readFile(outPath, 'utf8')).toBe('notes')
  })
})
