import { beforeEach, describe, expect, it, mock } from 'bun:test'

let hasManagedRemotePrincipal = true
let policyAllowed = true

const remotePaths = [
  import.meta.resolve('../../auth/capabilities/remote.ts'),
  import.meta.resolve('../../auth/capabilities/remote.js'),
]
const policyPaths = [
  import.meta.resolve('../../services/policyLimits/index.ts'),
  import.meta.resolve('../../services/policyLimits/index.js'),
]

const actualRemote = await import(
  import.meta.resolve('../../auth/capabilities/remote.ts')
)
const actualPolicy = await import(
  import.meta.resolve('../../services/policyLimits/index.ts')
)

for (const remotePath of remotePaths) {
  mock.module(remotePath, () => ({
    ...actualRemote,
    hasCurrentManagedRemoteCommandPrincipal() {
      return hasManagedRemotePrincipal
    },
  }))
}

for (const policyPath of policyPaths) {
  mock.module(policyPath, () => ({
    ...actualPolicy,
    isPolicyAllowed() {
      return policyAllowed
    },
  }))
}

const remoteEnv = (await import(import.meta.resolve('./index.ts'))).default

beforeEach(() => {
  hasManagedRemotePrincipal = true
  policyAllowed = true
})

describe('/remote-env command availability', () => {
  it('is enabled when a managed remote principal exists and policy allows remote sessions', () => {
    expect(remoteEnv.isEnabled()).toBe(true)
    expect(remoteEnv.isHidden).toBe(false)
  })

  it('is hidden and disabled without a managed remote principal', () => {
    hasManagedRemotePrincipal = false

    expect(remoteEnv.isEnabled()).toBe(false)
    expect(remoteEnv.isHidden).toBe(true)
  })

  it('is hidden and disabled when policy disallows remote sessions', () => {
    policyAllowed = false

    expect(remoteEnv.isEnabled()).toBe(false)
    expect(remoteEnv.isHidden).toBe(true)
  })
})
