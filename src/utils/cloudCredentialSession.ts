import {
  clearAwsCredentialsCache,
  clearGcpCredentialsCache,
  prefetchAwsCredentialsAndBedRockInfoIfSafe,
  prefetchGcpCredentialsIfSafe,
  refreshAndGetAwsCredentials,
  refreshGcpCredentialsIfNeeded,
} from './auth.js'

export function shouldPrefetchAwsCredentialsAtStartup(options: {
  useBedrock: boolean
  skipBedrockAuth: boolean
}): boolean {
  return options.useBedrock && !options.skipBedrockAuth
}

export function shouldPrefetchGcpCredentialsAtStartup(options: {
  useVertex: boolean
  skipVertexAuth: boolean
}): boolean {
  return options.useVertex && !options.skipVertexAuth
}

export function prefetchCurrentAwsCredentialsAndBedrockInfoIfSafe(): void {
  prefetchAwsCredentialsAndBedRockInfoIfSafe()
}

export function prefetchCurrentGcpCredentialsIfSafe(): void {
  prefetchGcpCredentialsIfSafe()
}

export async function refreshCurrentAwsCredentials() {
  return refreshAndGetAwsCredentials()
}

export async function refreshCurrentGcpCredentialsIfNeeded() {
  return refreshGcpCredentialsIfNeeded()
}

export function clearCurrentAwsCredentialsCache(): void {
  clearAwsCredentialsCache()
}

export function clearCurrentGcpCredentialsCache(): void {
  clearGcpCredentialsCache()
}
