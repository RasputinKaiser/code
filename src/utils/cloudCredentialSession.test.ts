import { describe, expect, it } from 'bun:test'

import {
  shouldPrefetchAwsCredentialsAtStartup,
  shouldPrefetchGcpCredentialsAtStartup,
} from './cloudCredentialSession.js'

describe('shouldPrefetchAwsCredentialsAtStartup', () => {
  it('prefetches only for enabled non-skipped Bedrock auth', () => {
    expect(
      shouldPrefetchAwsCredentialsAtStartup({
        useBedrock: true,
        skipBedrockAuth: false,
      }),
    ).toBe(true)
    expect(
      shouldPrefetchAwsCredentialsAtStartup({
        useBedrock: true,
        skipBedrockAuth: true,
      }),
    ).toBe(false)
    expect(
      shouldPrefetchAwsCredentialsAtStartup({
        useBedrock: false,
        skipBedrockAuth: false,
      }),
    ).toBe(false)
  })
})

describe('shouldPrefetchGcpCredentialsAtStartup', () => {
  it('prefetches only for enabled non-skipped Vertex auth', () => {
    expect(
      shouldPrefetchGcpCredentialsAtStartup({
        useVertex: true,
        skipVertexAuth: false,
      }),
    ).toBe(true)
    expect(
      shouldPrefetchGcpCredentialsAtStartup({
        useVertex: true,
        skipVertexAuth: true,
      }),
    ).toBe(false)
    expect(
      shouldPrefetchGcpCredentialsAtStartup({
        useVertex: false,
        skipVertexAuth: false,
      }),
    ).toBe(false)
  })
})
