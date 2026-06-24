import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { enableConfigs } from '../../utils/config.js'

const claudePath = import.meta.resolve('./claude.ts')
const inferenceClientPaths = [
  import.meta.resolve('./inferenceClient.ts'),
  import.meta.resolve('./inferenceClient.js'),
]
const providersPaths = [
  import.meta.resolve('../../utils/model/providers.ts'),
  import.meta.resolve('../../utils/model/providers.js'),
]
const actualProvidersModule = await import(
  import.meta.resolve('../../utils/model/providers.ts')
)
const originalNodeEnv = process.env.NODE_ENV
const originalNoumenaApiKey = process.env.NOUMENA_API_KEY

beforeEach(() => {
  process.env.NODE_ENV = 'test'
  process.env.NOUMENA_API_KEY = 'test-api-key'
  enableConfigs()
})

afterEach(() => {
  mock.restore()
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV
  } else {
    process.env.NODE_ENV = originalNodeEnv
  }
  if (originalNoumenaApiKey === undefined) {
    delete process.env.NOUMENA_API_KEY
  } else {
    process.env.NOUMENA_API_KEY = originalNoumenaApiKey
  }
})

function asyncModels(models: Array<Record<string, unknown>>) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const model of models) {
        yield model
      }
    },
  }
}

async function importVerifyApiKey(caseName: string) {
  const module = await import(`${claudePath}?case=${caseName}`)
  return module.verifyApiKey as typeof import('./claude.js').verifyApiKey
}

describe('verifyApiKey', () => {
  test('uses listModels on the first-party path instead of a synthetic completion', async () => {
    const listModels = mock(() => asyncModels([{ id: 'm1' }]))
    const createMessage = mock(async () => ({ ok: true }))

    for (const path of inferenceClientPaths) {
      mock.module(path, () => ({
        getInferenceClient: async () => ({ listModels, createMessage }),
      }))
    }
    for (const path of providersPaths) {
      mock.module(path, () => ({
        ...actualProvidersModule,
        getAPIProvider: () => 'firstParty',
        isFirstPartyNoumenaBaseUrl: () => true,
      }))
    }

    const verifyApiKey = await importVerifyApiKey('first-party-list-models')
    await expect(verifyApiKey('test-key', false)).resolves.toBe(true)
    expect(listModels).toHaveBeenCalledTimes(1)
    expect(createMessage).not.toHaveBeenCalled()
  })

  test('keeps the direct completion verifier off the first-party path', async () => {
    const listModels = mock(() => asyncModels([{ id: 'm1' }]))
    const createMessage = mock(async () => ({ ok: true }))

    for (const path of inferenceClientPaths) {
      mock.module(path, () => ({
        getInferenceClient: async () => ({ listModels, createMessage }),
      }))
    }
    for (const path of providersPaths) {
      mock.module(path, () => ({
        ...actualProvidersModule,
        getAPIProvider: () => 'bedrock',
        isFirstPartyNoumenaBaseUrl: () => false,
      }))
    }

    const verifyApiKey = await importVerifyApiKey('non-first-party-create-message')
    await expect(verifyApiKey('test-key', false)).resolves.toBe(true)
    expect(createMessage).toHaveBeenCalledTimes(1)
    expect(listModels).not.toHaveBeenCalled()
  })

  test('treats first-party 401 model verification failures as invalid keys', async () => {
    const listModels = mock(() => ({
      async *[Symbol.asyncIterator]() {
        throw new Error('OpenAI compat models request failed: 401 Unauthorized')
      },
    }))
    const createMessage = mock(async () => ({ ok: true }))

    for (const path of inferenceClientPaths) {
      mock.module(path, () => ({
        getInferenceClient: async () => ({ listModels, createMessage }),
      }))
    }
    for (const path of providersPaths) {
      mock.module(path, () => ({
        ...actualProvidersModule,
        getAPIProvider: () => 'firstParty',
        isFirstPartyNoumenaBaseUrl: () => true,
      }))
    }

    const verifyApiKey = await importVerifyApiKey('first-party-401-invalid')
    await expect(verifyApiKey('test-key', false)).resolves.toBe(false)
    expect(listModels).toHaveBeenCalledTimes(1)
    expect(createMessage).not.toHaveBeenCalled()
  })
})
