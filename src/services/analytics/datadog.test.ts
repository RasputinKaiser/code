import { afterEach, describe, expect, it, spyOn } from 'bun:test'
import axios from 'axios'

import {
  initializeDatadog,
  resetDatadogForTests,
  shutdownDatadog,
  trackDatadogEvent,
} from './datadog.js'

const originalNodeEnv = process.env.NODE_ENV
const originalEndpoint = process.env.NCODE_DATADOG_LOGS_ENDPOINT
const originalToken = process.env.NCODE_DATADOG_CLIENT_TOKEN
const originalFlushInterval = process.env.NCODE_DATADOG_FLUSH_INTERVAL_MS

function restoreEnvVar(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
}

afterEach(async () => {
  process.env.NODE_ENV = originalNodeEnv
  restoreEnvVar('NCODE_DATADOG_LOGS_ENDPOINT', originalEndpoint)
  restoreEnvVar('NCODE_DATADOG_CLIENT_TOKEN', originalToken)
  restoreEnvVar('NCODE_DATADOG_FLUSH_INTERVAL_MS', originalFlushInterval)
  await shutdownDatadog()
  resetDatadogForTests()
  spyOn(axios, 'post').mockRestore()
})

describe('Datadog analytics sink', () => {
  it('does not initialize or post without explicit Noumena Datadog config', async () => {
    process.env.NODE_ENV = 'production'
    delete process.env.NCODE_DATADOG_LOGS_ENDPOINT
    delete process.env.NCODE_DATADOG_CLIENT_TOKEN
    const post = spyOn(axios, 'post')

    expect(await initializeDatadog()).toBe(false)

    await trackDatadogEvent('ncode_started', {
      startup_duration_ms: 1,
    })
    await shutdownDatadog()

    expect(post).not.toHaveBeenCalled()
  })

  it('initializes only with an explicitly configured endpoint and token', async () => {
    process.env.NODE_ENV = 'production'
    process.env.NCODE_DATADOG_LOGS_ENDPOINT = 'https://datadog.example.test/logs'
    process.env.NCODE_DATADOG_CLIENT_TOKEN = 'ncode-datadog-token'
    const post = spyOn(axios, 'post').mockResolvedValue({ status: 202 })

    expect(await initializeDatadog()).toBe(true)

    await shutdownDatadog()

    expect(post).not.toHaveBeenCalled()
  })
})
