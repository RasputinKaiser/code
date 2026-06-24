/**
 * Constants for the official Noumena plugins marketplace.
 *
 * The official marketplace is hosted on GitHub and provides first-party
 * plugins developed by Noumena. This file defines the constants needed
 * to install and identify this marketplace.
 */

import type { MarketplaceSource } from './schemas.js'
import { isEnvTruthy } from '../envUtils.js'

/**
 * Source configuration for the official Noumena plugins marketplace.
 * Used when auto-installing the marketplace on startup.
 */
export const OFFICIAL_MARKETPLACE_SOURCE = {
  source: 'github',
  repo: 'noumena/ncode',
} as const satisfies MarketplaceSource

/**
 * Display name for the official marketplace.
 * This is the name under which the marketplace will be registered
 * in the known_marketplaces.json file.
 */
export const OFFICIAL_MARKETPLACE_NAME = 'noumena-plugins-official'

/**
 * Emergency-only escape hatch for official marketplace git fallback.
 *
 * Do not wire this to remote flags: the fallback can hit private GitHub from
 * non-interactive startup paths. The safe default is to avoid git and wait for
 * the hosted official marketplace archive.
 */
export function isOfficialMarketplaceGitFallbackEnabled(): boolean {
  return (
    isEnvTruthy(process.env.NCODE_PLUGIN_OFFICIAL_MARKETPLACE_GIT_FALLBACK) ||
    isEnvTruthy(process.env.CLAUDE_CODE_PLUGIN_OFFICIAL_MARKETPLACE_GIT_FALLBACK)
  )
}
