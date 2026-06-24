// Copyright 2026 Noumena, Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Public build guard for the code/ product.
 *
 * This test MUST pass before any public release cut of the `code/` CLI/app.
 * It verifies that public spin does not depend on internal-only or
 * Anthropic-specific branding, paths, env vars, or capabilities.
 */

import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  formatFindings,
  getDefaultAllowlist,
  runExposureAudit,
} from '../../constants/repoExposureAudit.js'
import {
  getDefaultFirstPartyInferenceBaseUrl,
  getOauthConfig,
} from '../../constants/oauth.js'
import { getGrowthBookClientKey } from '../../constants/keys.js'
import { resolveFirstPartyEventLoggingBaseUrl } from '../../services/analytics/firstPartyEventLoggingExporter.js'
import { resolveGrowthBookApiHost } from '../../services/analytics/growthbookHost.js'
import { resolveBigQueryMetricsEndpoint } from '../../utils/telemetry/bigqueryExporter.js'
import { getNoumenaPlatformBaseUrl } from '../../utils/platformUrls.js'
import { getCapabilities } from '../matrix.js'
import { BUILD_SPIN, isInternalBuild } from '../static.js'

const codeRoot = path.resolve(import.meta.dir, '../../..')

describe('public build guard', () => {
  it('public spin does not expose internal-only capabilities', () => {
    const publicManaged = getCapabilities('public', 'noumena-managed', 'direct')
    expect(publicManaged.has('tungsten')).toBe(false)
    expect(publicManaged.has('internal-marketplace')).toBe(false)
    expect(publicManaged.has('debug-preview')).toBe(false)
    expect(publicManaged.has('slash-commands')).toBe(false)

    const publicByok = getCapabilities('public', 'byok-anthropic', 'direct')
    expect(publicByok.has('tungsten')).toBe(false)
    expect(publicByok.has('remote-sessions')).toBe(false)
    expect(publicByok.has('agent-swarms')).toBe(false)
    expect(publicByok.has('internal-marketplace')).toBe(false)
    expect(publicByok.has('debug-preview')).toBe(false)
    expect(publicByok.has('slash-commands')).toBe(false)
  })

  it('public spin exposes the production capability set', () => {
    const caps = getCapabilities('public', 'noumena-managed', 'direct')
    expect(caps.has('remote-sessions')).toBe(true)
    expect(caps.has('agent-swarms')).toBe(true)
    expect(caps.has('plan-mode')).toBe(true)
    expect(caps.has('marketplace')).toBe(true)
    expect(caps.has('skills')).toBe(true)
    expect(caps.has('mcp')).toBe(true)
    expect(caps.has('web-search')).toBe(true)
    expect(caps.has('web-fetch')).toBe(true)
    expect(caps.has('first-party-analytics')).toBe(true)
    expect(caps.has('first-party-features')).toBe(true)
    expect(caps.has('cost-tracking')).toBe(true)
    expect(caps.has('model-config')).toBe(true)
  })

  it('BUILD_SPIN resolves to public by default', () => {
    expect(BUILD_SPIN).toBe('public')
  })

  it('isInternalBuild() is false for public spin', () => {
    expect(isInternalBuild()).toBe(false)
  })

  it('launch-critical build scripts do not contain legacy internal env fallback markers', () => {
    const legacyPrefix = ['CLAUDE', 'CODE', 'LEAK'].join('_') + '_'
    const launchScripts = [
      'build/build.mjs',
      'build/package.mjs',
      'scripts/run_runtime_dynamic_probe.mjs',
      'src/commands/env/index.js',
    ]

    for (const relativePath of launchScripts) {
      const content = readFileSync(path.join(codeRoot, relativePath), 'utf8')
      expect(content).not.toContain(legacyPrefix)
    }
  })

  it('public spin does not default to a staging feature-config host', () => {
    const growthbookHost = resolveGrowthBookApiHost({})
    if (growthbookHost) {
      expect(growthbookHost).not.toContain('flags.dev.noumena.test')
    }
  })

  it('public spin does not use a hardcoded GrowthBook client key', () => {
    const previous = process.env.NOUMENA_GROWTHBOOK_CLIENT_KEY
    delete process.env.NOUMENA_GROWTHBOOK_CLIENT_KEY
    try {
      const key = getGrowthBookClientKey()
      expect(key).toBeUndefined()
    } finally {
      if (previous !== undefined) {
        process.env.NOUMENA_GROWTHBOOK_CLIENT_KEY = previous
      }
    }
  })

  it('public spin defaults to Noumena-owned OAuth and platform endpoints', () => {
    delete process.env.NCODE_BUILD_MODE
    delete process.env.USER_TYPE
    delete process.env.USE_LOCAL_OAUTH
    delete process.env.NOUMENA_PLATFORM_BASE_URL
    delete process.env.NOUMENA_ISSUER_BASE_URL
    delete process.env.CLAUDE_CODE_CUSTOM_OAUTH_URL
    expect(getOauthConfig().BASE_API_URL).toBe('https://api.noumena.com')
    expect(getOauthConfig().MCP_PROXY_URL).toBe('https://api.noumena.com')
    expect(getDefaultFirstPartyInferenceBaseUrl()).toBe('https://api.noumena.com')
    expect(getNoumenaPlatformBaseUrl()).toBe('https://api.noumena.com')
  })

  it('public telemetry sinks require explicit Noumena endpoints', () => {
    const previousEventBase = process.env.NOUMENA_EVENT_LOGGING_BASE_URL
    const previousMetricsEndpoint = process.env.NOUMENA_METRICS_ENDPOINT
    const previousPlatformBase = process.env.NOUMENA_PLATFORM_BASE_URL
    delete process.env.NOUMENA_EVENT_LOGGING_BASE_URL
    delete process.env.NOUMENA_METRICS_ENDPOINT
    delete process.env.NOUMENA_PLATFORM_BASE_URL
    try {
      expect(() => resolveFirstPartyEventLoggingBaseUrl()).toThrow(/NOUMENA_EVENT_LOGGING_BASE_URL/)
      expect(() => resolveBigQueryMetricsEndpoint()).toThrow(/NOUMENA_METRICS_ENDPOINT/)

      process.env.NOUMENA_EVENT_LOGGING_BASE_URL = 'https://telemetry.noumena.com/'
      process.env.NOUMENA_METRICS_ENDPOINT = 'https://metrics.noumena.com/api/ncode/metrics'
      expect(resolveFirstPartyEventLoggingBaseUrl()).toBe('https://telemetry.noumena.com')
      expect(resolveBigQueryMetricsEndpoint()).toBe('https://metrics.noumena.com/api/ncode/metrics')
    } finally {
      if (previousEventBase === undefined) delete process.env.NOUMENA_EVENT_LOGGING_BASE_URL
      else process.env.NOUMENA_EVENT_LOGGING_BASE_URL = previousEventBase
      if (previousMetricsEndpoint === undefined) delete process.env.NOUMENA_METRICS_ENDPOINT
      else process.env.NOUMENA_METRICS_ENDPOINT = previousMetricsEndpoint
      if (previousPlatformBase === undefined) delete process.env.NOUMENA_PLATFORM_BASE_URL
      else process.env.NOUMENA_PLATFORM_BASE_URL = previousPlatformBase
    }
  })

  it('public spin has no high-confidence source exposure blockers in launch-critical paths', () => {
    const findings = runExposureAudit({ allowlist: getDefaultAllowlist() })
    if (findings.length > 0) {
      console.error(formatFindings(findings))
    }
    expect(findings).toEqual([])
  })
})
