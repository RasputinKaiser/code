import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { getAuthRuntime } from '../../auth/runtime/AuthRuntime.js'

const axiosCalls: Array<Record<string, unknown>> = []
let mockedSession = { principalSource: 'managed_oauth' as const }
let mockedCapability:
  | { accessToken: string; orgUUID: string }
  | Error = {
  accessToken: 'managed-token',
  orgUUID: 'org-123',
}

const actualAxios = await import(import.meta.resolve('axios'))
const actualGrowthbook = await import(
  import.meta.resolve('../../services/analytics/growthbook.ts')
)
const actualPolicyLimits = await import(
  import.meta.resolve('../../services/policyLimits/index.ts')
)
const actualRemoteCapability = await import(
  import.meta.resolve('../../auth/capabilities/remote.ts')
)
const authRuntime = getAuthRuntime() as ReturnType<typeof getAuthRuntime> & {
  getCurrentSession: () => unknown
}
const originalGetCurrentSession = authRuntime.getCurrentSession.bind(authRuntime)

mock.module(import.meta.resolve('axios'), () => ({
  ...actualAxios,
  default: {
    ...actualAxios.default,
    request: async (config: Record<string, unknown>) => {
      axiosCalls.push(config)
      return { status: 200, data: { ok: true } }
    },
  },
}))

for (const path of [
  import.meta.resolve('../../auth/capabilities/remote.ts'),
  import.meta.resolve('../../auth/capabilities/remote.js'),
]) {
  mock.module(path, () => ({
      ...actualRemoteCapability,
      async resolveManagedRemoteCapability() {
        if (mockedCapability instanceof Error) {
          throw mockedCapability
        }
        return {
          ...mockedCapability,
          session: {
            principalSource: 'managed_oauth',
            sessionState: 'usable',
          },
        }
      },
    }))
}

for (const path of [
  import.meta.resolve('../../services/analytics/growthbook.ts'),
  import.meta.resolve('../../services/analytics/growthbook.js'),
]) {
  mock.module(path, () => ({
      ...actualGrowthbook,
      getFeatureValue_CACHED_MAY_BE_STALE() {
        return true
      },
    }))
}

for (const path of [
  import.meta.resolve('../../services/policyLimits/index.ts'),
  import.meta.resolve('../../services/policyLimits/index.js'),
]) {
  mock.module(path, () => ({
      ...actualPolicyLimits,
      isPolicyAllowed() {
        return true
      },
    }))
}

const { RemoteTriggerTool } = await import('./RemoteTriggerTool.ts')

beforeEach(() => {
  axiosCalls.length = 0
  mockedSession = { principalSource: 'managed_oauth' }
  mockedCapability = {
    accessToken: 'managed-token',
    orgUUID: 'org-123',
  }
  authRuntime.getCurrentSession = () => mockedSession
})

describe('RemoteTriggerTool auth', () => {
  it('uses the canonical managed remote capability for trigger requests', async () => {
    const result = await RemoteTriggerTool.call(
      { action: 'list' },
      { abortController: new AbortController() } as never,
    )

    expect(result.data).toEqual({
      status: 200,
      json: '{"ok":true}',
    })
    expect(axiosCalls).toEqual([
      expect.objectContaining({
        method: 'GET',
        url: expect.stringContaining('/v1/code/triggers'),
        headers: {
          Authorization: 'Bearer managed-token',
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'ccr-triggers-2026-01-30',
          'x-organization-uuid': 'org-123',
        },
      }),
    ])
  })

  it('fails with the console-key specific guidance before remote capability resolution', async () => {
    mockedSession = { principalSource: 'console_api_key' }

    await expect(
      RemoteTriggerTool.call(
        { action: 'list' },
        { abortController: new AbortController() } as never,
      ),
    ).rejects.toThrow(
      'Authenticated with a console API key, but scheduled remote agents require a managed Noumena account login.',
    )
    expect(axiosCalls).toEqual([])
  })
})

afterEach(() => {
  authRuntime.getCurrentSession = originalGetCurrentSession
})
