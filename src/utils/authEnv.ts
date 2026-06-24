export type DirectApiKeyEnvVarName = 'NOUMENA_API_KEY' | 'ANTHROPIC_API_KEY'
export type DirectApiKeyProviderMode = 'noumena_managed' | 'byok_static_env'

export function getDirectApiKeyEnvVarName(): DirectApiKeyEnvVarName | null {
  if (process.env.NOUMENA_API_KEY) {
    return 'NOUMENA_API_KEY'
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return 'ANTHROPIC_API_KEY'
  }
  return null
}

export function getDirectApiKeyEnvValue(): string | undefined {
  const envVarName = getDirectApiKeyEnvVarName()
  return envVarName ? process.env[envVarName] : undefined
}

export function getDirectApiKeyProviderMode(
  envVarName: DirectApiKeyEnvVarName | null = getDirectApiKeyEnvVarName(),
): DirectApiKeyProviderMode | null {
  if (envVarName === 'NOUMENA_API_KEY') {
    return 'noumena_managed'
  }
  if (envVarName === 'ANTHROPIC_API_KEY') {
    return 'byok_static_env'
  }
  return null
}
