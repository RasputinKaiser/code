import { describe, expect, it } from 'bun:test'
import { buildSessionIngressLease } from '../auth/runtime/leases.js'
import {
  buildSessionIngressRuntimeEnvironmentUpdate,
  buildSessionIngressRuntimeEnvironmentVariables,
} from './sessionRunner.js'

describe('sessionRunner session-ingress lease helpers', () => {
  it('renders explicit lease metadata into the child runtime environment', () => {
    const lease = buildSessionIngressLease({
      executionTarget: 'remote',
      organizationUuid: 'org-123',
      sessionId: 'cse_123',
      token: 'jwt-token',
    })

    expect(
      buildSessionIngressRuntimeEnvironmentVariables({
        accessToken: 'jwt-token',
        sessionIngressLease: lease,
      }),
    ).toEqual({
      CLAUDE_CODE_SESSION_ACCESS_TOKEN: 'jwt-token',
      NCODE_SESSION_INGRESS_LEASE_ID: 'session_ingress:cse_123:bearer',
      NCODE_SESSION_INGRESS_LEASE_KIND: 'session_ingress',
      NCODE_SESSION_INGRESS_LEASE_STATE: 'usable',
      NCODE_SESSION_INGRESS_LEASE_EXECUTION_TARGET: 'remote',
      NCODE_SESSION_INGRESS_LEASE_PROVIDER_MODE: 'noumena_managed',
      NCODE_SESSION_INGRESS_LEASE_RENEWABLE: '1',
      NCODE_SESSION_INGRESS_LEASE_RENEWAL_OWNER: 'session_runtime',
      NCODE_SESSION_INGRESS_LEASE_TOKEN_TRANSPORT: 'bearer',
      NCODE_SESSION_INGRESS_LEASE_ORGANIZATION_UUID: 'org-123',
    })
  })

  it('updates both the legacy token env and lease metadata on token refresh', () => {
    const staleLease = buildSessionIngressLease({
      executionTarget: 'remote',
      organizationUuid: 'org-123',
      sessionId: 'cse_123',
      token: 'stale-jwt-token',
    })

    const update = buildSessionIngressRuntimeEnvironmentUpdate({
      accessToken: 'fresh-jwt-token',
      sessionId: 'cse_123',
      sessionIngressLease: staleLease,
    })
    const parsed = JSON.parse(update.trim()) as {
      type: string
      variables: Record<string, string>
    }

    expect(parsed.type).toBe('update_environment_variables')
    expect(parsed.variables).toEqual({
      CLAUDE_CODE_SESSION_ACCESS_TOKEN: 'fresh-jwt-token',
      NCODE_SESSION_INGRESS_LEASE_ID: 'session_ingress:cse_123:bearer',
      NCODE_SESSION_INGRESS_LEASE_KIND: 'session_ingress',
      NCODE_SESSION_INGRESS_LEASE_STATE: 'usable',
      NCODE_SESSION_INGRESS_LEASE_EXECUTION_TARGET: 'remote',
      NCODE_SESSION_INGRESS_LEASE_PROVIDER_MODE: 'noumena_managed',
      NCODE_SESSION_INGRESS_LEASE_RENEWABLE: '1',
      NCODE_SESSION_INGRESS_LEASE_RENEWAL_OWNER: 'session_runtime',
      NCODE_SESSION_INGRESS_LEASE_TOKEN_TRANSPORT: 'bearer',
      NCODE_SESSION_INGRESS_LEASE_ORGANIZATION_UUID: 'org-123',
    })
  })

  it('preserves cookie transport metadata for session-key based ingress auth', () => {
    const lease = buildSessionIngressLease({
      executionTarget: 'remote',
      organizationUuid: 'org-cookie',
      sessionId: 'cse_cookie',
      token: 'sk-ant-sid-cookie-token',
    })

    expect(
      buildSessionIngressRuntimeEnvironmentVariables({
        accessToken: 'sk-ant-sid-cookie-token',
        sessionIngressLease: lease,
      }),
    ).toMatchObject({
      CLAUDE_CODE_SESSION_ACCESS_TOKEN: 'sk-ant-sid-cookie-token',
      NCODE_SESSION_INGRESS_LEASE_ID: 'session_ingress:cse_cookie:cookie',
      NCODE_SESSION_INGRESS_LEASE_TOKEN_TRANSPORT: 'cookie',
      NCODE_SESSION_INGRESS_LEASE_ORGANIZATION_UUID: 'org-cookie',
    })
  })
})
