import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const DEFAULT_LAUNCH_PATH_INFERENCE_BASE_URL = 'https://code.dev.noumena.test'
export const DEFAULT_LAUNCH_PATH_MODEL = 'Kimi 2.7 Coder'

export function getSmokeRuntimeConfig(env = process.env) {
  const model = env.NOUMENA_MODEL || DEFAULT_LAUNCH_PATH_MODEL
  return {
    issuerBaseUrl: env.NOUMENA_ISSUER_BASE_URL || 'https://api.noumena.com',
    platformBaseUrl: env.NOUMENA_PLATFORM_BASE_URL || 'https://api.noumena.com',
    inferenceBaseUrl: env.NOUMENA_BASE_URL || DEFAULT_LAUNCH_PATH_INFERENCE_BASE_URL,
    model,
    smallFastModel: env.NOUMENA_SMALL_FAST_MODEL || model,
    apiTimeoutMs: env.API_TIMEOUT_MS || '30000',
  }
}

export function createSharedSmokeEnv(configDir, runtimeConfig, extraEnv = {}) {
  return {
    ...process.env,
    NCODE_CONFIG_DIR: configDir,
    NCODE_BUILD_MODE: process.env.NCODE_BUILD_MODE || 'noumena',
    NOUMENA_ISSUER_BASE_URL: runtimeConfig.issuerBaseUrl,
    NOUMENA_PLATFORM_BASE_URL: runtimeConfig.platformBaseUrl,
    NOUMENA_BASE_URL: runtimeConfig.inferenceBaseUrl,
    NOUMENA_MODEL: runtimeConfig.model,
    NOUMENA_SMALL_FAST_MODEL: runtimeConfig.smallFastModel,
    API_TIMEOUT_MS: runtimeConfig.apiTimeoutMs,
    ...extraEnv,
  }
}

export function resolveSmokeGlobalConfigFilename(env) {
  if (env.CLAUDE_CODE_CUSTOM_OAUTH_URL) return '.claude-custom-oauth.json'
  const buildMode = env.NCODE_BUILD_MODE || process.env.NCODE_BUILD_MODE || ''
  const userType = env.USER_TYPE || process.env.USER_TYPE || ''
  const isNoumenaLane = buildMode === 'noumena' || userType === 'ant'
  if (isNoumenaLane && env.USE_LOCAL_OAUTH === '1') return '.claude-local-oauth.json'
  if (isNoumenaLane && env.USE_STAGING_OAUTH === '1') return '.claude-staging-oauth.json'
  return '.claude.json'
}

export function getSmokeGlobalConfigPath(configDir, env) {
  return join(configDir, resolveSmokeGlobalConfigFilename(env))
}

export async function writeSmokeGlobalConfig(configDir, env, config) {
  const configPath = getSmokeGlobalConfigPath(configDir, env)
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  return configPath
}
