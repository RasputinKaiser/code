import { join } from 'path'
import { getNcodeConfigHomeDir } from './envUtils.js'
import { getFsImplementation } from './fsOperations.js'

type FileBackedSecret = {
  envVar: string
  overrideEnvVars: string[]
  defaultFileName: string
}

const FILE_BACKED_SECRETS: FileBackedSecret[] = [
  {
    envVar: 'EXA_API_KEY',
    overrideEnvVars: ['NCODE_EXA_API_KEY_FILE', 'NCODE_STAGING_EXA_API_KEY_FILE'],
    defaultFileName: 'exa_api_key',
  },
  {
    envVar: 'BRAVE_SEARCH_API_KEY',
    overrideEnvVars: [
      'NCODE_BRAVE_SEARCH_API_KEY_FILE',
      'NCODE_STAGING_BRAVE_SEARCH_API_KEY_FILE',
    ],
    defaultFileName: 'brave_search_api_key',
  },
  {
    envVar: 'BRAVE_API_KEY',
    overrideEnvVars: ['NCODE_BRAVE_API_KEY_FILE', 'NCODE_STAGING_BRAVE_API_KEY_FILE'],
    defaultFileName: 'brave_api_key',
  },
]

function resolveSecretPath(secret: FileBackedSecret, configDir: string): string {
  for (const overrideEnvVar of secret.overrideEnvVars) {
    const candidate = process.env[overrideEnvVar]
    if (candidate) {
      return candidate
    }
  }

  return join(configDir, secret.defaultFileName)
}

function readSecretIfPresent(secretPath: string): string | null {
  try {
    const secretValue = getFsImplementation()
      .readFileSync(secretPath, { encoding: 'utf8' })
      .trim()
    return secretValue.length > 0 ? secretValue : null
  } catch {
    return null
  }
}

export function loadFileBackedSecrets(): void {
  const configDir = getNcodeConfigHomeDir()

  for (const secret of FILE_BACKED_SECRETS) {
    if (process.env[secret.envVar]) {
      continue
    }

    const secretPath = resolveSecretPath(secret, configDir)
    const secretValue = readSecretIfPresent(secretPath)
    if (secretValue) {
      process.env[secret.envVar] = secretValue
    }
  }
}
