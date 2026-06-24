// Copyright 2026 Noumena, Inc. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Capability model for NCode.
 *
 * Replaces the scattered `USER_TYPE === 'ant' || NCODE_BUILD_MODE === 'noumena'`
 * gates with a declarative, multi-dimensional capability system.
 *
 * Dimensions:
 *   - Spin:        dev | internal | public
 *   - AuthProvider: noumena-managed | noumena-apikey | byok-anthropic | byok-openai
 *   - AccessMode:   direct | remote
 */

export type Spin = 'dev' | 'internal' | 'public'

export type AuthProvider =
  | 'noumena-managed'
  | 'noumena-apikey'
  | 'byok-anthropic'
  | 'byok-openai'

export type AccessMode = 'direct' | 'remote'

export type Capability =
  // Session / terminal
  | 'tungsten'
  | 'remote-sessions'
  // Multi-agent
  | 'agent-swarms'
  | 'buddy'
  // Planning
  | 'plan-mode'
  | 'auto-mode'
  // Tools
  | 'web-search'
  | 'web-fetch'
  | 'mcp'
  | 'skills'
  | 'repl-js'
  | 'repl-py'
  // Marketplace
  | 'marketplace'
  | 'internal-marketplace'
  // Analytics
  | 'first-party-analytics'
  | 'first-party-features'
  // Commands / UI
  | 'slash-commands'
  | 'debug-preview'
  | 'bridge'
  | 'bash-permissions'
  // Model
  | 'model-config'
  | 'cost-tracking'
