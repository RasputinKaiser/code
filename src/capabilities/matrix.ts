// Copyright 2026 Noumena, Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Declarative capability matrix.
 *
 * Each cell is a Set of capabilities available for a given
 * Spin × AuthProvider × AccessMode combination.
 *
 * This is the single source of truth for which features are available in
 * which product configuration. All previous ad-hoc env-gate branches
 * should route through this matrix.
 */

import type { AuthProvider, AccessMode, Capability, Spin } from './types.js'

const ALL = new Set<Capability>([
  'tungsten',
  'remote-sessions',
  'agent-swarms',
  'buddy',
  'plan-mode',
  'auto-mode',
  'web-search',
  'web-fetch',
  'mcp',
  'skills',
  'repl-js',
  'repl-py',
  'marketplace',
  'internal-marketplace',
  'first-party-analytics',
  'first-party-features',
  'slash-commands',
  'debug-preview',
  'bridge',
  'bash-permissions',
  'model-config',
  'cost-tracking',
])

const PUBLIC_BYOK = new Set<Capability>([
  'plan-mode',
  'marketplace',
  'skills',
  'bash-permissions',
  'mcp',
  'web-search',
  'web-fetch',
])

const PUBLIC_MANAGED = new Set<Capability>([
  ...PUBLIC_BYOK,
  'remote-sessions',
  'agent-swarms',
  'buddy',
  'auto-mode',
  'first-party-features',
  'first-party-analytics',
  'cost-tracking',
  'model-config',
])

const INTERNAL_BYOK = new Set<Capability>([
  ...PUBLIC_BYOK,
  'tungsten',
  'remote-sessions',
  'agent-swarms',
  'plan-mode',
  'auto-mode',
  'first-party-features',
  'cost-tracking',
  'model-config',
  'slash-commands',
])

const INTERNAL_MANAGED = new Set<Capability>([
  ...ALL,
])

function emptySet(): Set<Capability> {
  return new Set<Capability>()
}

function getCell(
  spin: Spin,
  auth: AuthProvider,
): Set<Capability> {
  switch (spin) {
    case 'dev':
      return ALL
    case 'internal':
      switch (auth) {
        case 'noumena-managed':
        case 'noumena-apikey':
          return INTERNAL_MANAGED
        case 'byok-anthropic':
        case 'byok-openai':
          return INTERNAL_BYOK
      }
      break
    case 'public':
      switch (auth) {
        case 'noumena-managed':
        case 'noumena-apikey':
          return PUBLIC_MANAGED
        case 'byok-anthropic':
        case 'byok-openai':
          return PUBLIC_BYOK
      }
      break
  }
  return emptySet()
}

/**
 * Get the set of capabilities for a given spin + auth + access combination.
 * Access mode does not currently gate any capabilities (it only affects
 * connection plumbing), but the parameter is retained for future expansion.
 */
export function getCapabilities(
  spin: Spin,
  authProvider: AuthProvider,
  _accessMode: AccessMode,
): ReadonlySet<Capability> {
  return getCell(spin, authProvider)
}
