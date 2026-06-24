// Copyright 2026 Noumena, Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Static capability checks (zero external dependencies).
 *
 * Safe to import from any module, including early-boot files like
 * command definitions, without risk of circular dependencies.
 */

import type { Spin } from './types.js'

/**
 * Build-time spin. Resolved once at startup from the compile-time define
 * and never changes.
 *
 * Because this is a const literal, the bundler can dead-code eliminate
 * `if (BUILD_SPIN === 'public')` branches, removing internal-only code
 * from public builds entirely.
 */
export const BUILD_SPIN: Spin =
  (process.env.NCODE_BUILD_MODE as Spin | undefined) ?? 'public'

/**
 * Returns true for any non-public spin (dev, internal).
 *
 * This is the semantic replacement for the legacy
 * `process.env.NCODE_BUILD_MODE === 'noumena' || process.env.USER_TYPE === 'ant'`
 * check used throughout the codebase.
 */
export function isInternalBuild(): boolean {
  return BUILD_SPIN === 'noumena' || BUILD_SPIN === 'internal' || BUILD_SPIN === 'dev' || process.env.USER_TYPE === 'ant'
}
