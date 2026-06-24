// Copyright 2026 Noumena, Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Capability resolution API.
 *
 * Usage:
 *   import { hasCapability, isInternalBuild } from './capabilities/index.js'
 *
 *   if (hasCapability('tungsten')) { ... }
 *   if (isInternalBuild()) { ... }
 *
 * Build-time constant (DCE eligible):
 *   const BUILD_SPIN = resolveBuildSpin()
 *   if (BUILD_SPIN !== 'public') { ... }   // bundler removes for public builds
 */

import { getAuthProvider, getAccessMode } from './runtime.js'
import { getCapabilities } from './matrix.js'
import { BUILD_SPIN } from './static.js'
import type { Capability } from './types.js'

export { BUILD_SPIN, isInternalBuild } from './static.js'

let _resolvedCaps: ReadonlySet<Capability> | undefined

/**
 * Resolve the full capability set for the current runtime configuration.
 * Cached after first call.
 */
export function getResolvedCapabilities(): ReadonlySet<Capability> {
  if (_resolvedCaps) {
    return _resolvedCaps
  }
  const auth = getAuthProvider()
  const access = getAccessMode()
  _resolvedCaps = getCapabilities(BUILD_SPIN, auth, access)
  return _resolvedCaps
}

/**
 * Check if a capability is enabled in the current runtime configuration.
 *
 * For build-time-only checks that the bundler can DCE, use `BUILD_SPIN`
 * directly or `isInternalBuild()` from `./static.js`.
 */
export function hasCapability(cap: Capability): boolean {
  return getResolvedCapabilities().has(cap)
}

/**
 * Reset the cached capability set. Used in tests that mutate runtime auth state.
 */
export function resetCapabilityCache(): void {
  _resolvedCaps = undefined
}
