import { afterEach, describe, expect, it } from 'bun:test'
import { getOauthConfig } from '../constants/oauth.js'
import { buildCcshareCandidateUrls } from './ccshareResume.js'

const originalNoumenaPlatformBaseUrl = process.env.NOUMENA_PLATFORM_BASE_URL

afterEach(() => {
  delete process.env.NOUMENA_PLATFORM_BASE_URL

  if (originalNoumenaPlatformBaseUrl) {
    process.env.NOUMENA_PLATFORM_BASE_URL = originalNoumenaPlatformBaseUrl
  }
})

describe('buildCcshareCandidateUrls', () => {
  it('prefers the Noumena platform override for first-party transcript fetches', () => {
    process.env.NOUMENA_PLATFORM_BASE_URL = 'https://platform-api.noumena.test/'

    expect(buildCcshareCandidateUrls('abc-20260101-123456')).toEqual([
      'https://platform-api.noumena.test/api/claude_code_shared_session_transcripts/abc-20260101-123456',
      'https://platform-api.noumena.test/api/claude_code_shared_session_transcripts/abc-20260101-123456/content',
      `${getOauthConfig().CLAUDE_AI_ORIGIN}/api/claude_code_shared_session_transcripts/abc-20260101-123456`,
      `${getOauthConfig().CLAUDE_AI_ORIGIN}/api/claude_code_shared_session_transcripts/abc-20260101-123456/content`,
    ])
  })
})
