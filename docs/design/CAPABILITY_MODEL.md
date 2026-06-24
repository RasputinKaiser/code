# NCode Capability Model Design

## Problem Statement

The NCode codebase contains approximately 370+ ad-hoc environment-gate checks
scattered across `code/src/`. The dominant pattern is:

```typescript
if (process.env.NCODE_BUILD_MODE === 'noumena' || process.env.USER_TYPE === 'ant') { ... }
```

This pattern conflates two separate dimensions:
- **NCODE_BUILD_MODE === 'noumena'** — the binary was built by Noumena's CI
- **USER_TYPE === 'ant'** — the binary targets Anthropic internal employees

Both currently mean "internal/privileged build," but for the 3-spin launch
(dev, internal, public) with 4 auth/provider modes, this boolean
-or-above gate is insufficient. We need a multi-dimensional capability model
that supports:

| Spin    | Auth Providers                        | Audience              |
|---------|---------------------------------------|-----------------------|
| Dev     | Any (developer's local choice)       | Noumena engineers     |
| Internal| Noumena managed, Noumena API key      | Noumena employees     |
| Public  | BYOK Anthropic, BYOK OpenAI           | External customers    |

## Design Overview

Replace the scattered `NCODE_BUILD_MODE || USER_TYPE` gates with a centralized,
orthogonal capability system. Capabilities are declared, queried, and enforced
through a single module. The build system and tree-shaking handle dead-code
elimination for external builds.

### Module Layout

```
code/src/capabilities/
  index.ts           — public API: getCapabilities(), hasCapability(), requireCapability()
  types.ts           — Capability enum, CapabilitySet, Spin, AuthProvider
  resolver.ts        — capability resolution from env/settings
  matrix.ts          — static capability matrix: Spin × AuthProvider → CapabilitySet
  registry.ts        — capability-to-consumer registry for diagnostic logging
```

### Types

```typescript
// code/src/capabilities/types.ts

export enum Spin {
  Dev = 'dev',
  Internal = 'internal',
  Public = 'public',
}

export enum AuthProvider {
  NoumenaManaged = 'noumena-managed',
  NoumenaApiKey = 'noumena-api-key',
  ByokAnthropic = 'byok-anthropic',
  ByokOpenAI = 'byok-openai',
}

export enum AccessMode {
  Direct = 'direct',   // Local inference or direct API
  Remote = 'remote',   // Via Noumena platform services
}

export enum Capability {
  // Terminal / execution surfaces
  Tungsten = 'tungsten',                   // tmux-backed sessions
  REPLTools = 'repl-tools',                // js_repl, py_repl, REPL
  Sandbox = 'sandbox',                     // seatbelt / linux sandbox

  // Model / inference surfaces
  ModelProviderSelection = 'model-provider-selection',  // choose inference backend
  ServerSideWebFetch = 'server-side-web-fetch',         // proxy through code_gateway
  ServerSideWebSearch = 'server-side-web-search',       // proxy through code_gateway

  // Collaboration / agent surfaces
  AgentSwarms = 'agent-swarms',            // multi-agent teams
  AgentTool = 'agent-tool',                  // single-agent orchestration
  RemoteTriggers = 'remote-triggers',      // scheduled remote execution
  BackgroundPR = 'background-pr',          // suggest/launch background PRs
  BuddyMode = 'buddy-mode',                // Noumena Buddy integration

  // Chrome / browser surfaces
  ChromeMCP = 'chrome-mcp',                // Claude for Chrome MCP server
  BrowserTools = 'browser-tools',          // browser_task, lightning_turn

  // Plan / permission surfaces
  PlanMode = 'plan-mode',                   // enter/exit plan mode
  PlanVerification = 'plan-verification',  // VerifyPlanExecutionTool
  PermissionModeCycling = 'permission-mode-cycling',  // shift+tab cycle
  UltraPlan = 'ultra-plan',                // /ultraplan command

  // Analytics / telemetry surfaces
  FirstPartyAnalytics = 'first-party-analytics',   // BigQuery, GrowthBook
  FirstPartySessionTracing = 'first-party-session-tracing',
  CustomEventLogging = 'custom-event-logging',

  // Auth / account surfaces
  ManagedAuth = 'managed-auth',            // OAuth2 flow
  ApiKeyAuth = 'api-key-auth',             // Noumena API key
  BYOKAuth = 'byok-auth',                  // Bring-your-own-key (Anthropic/OpenAI)

  // Internal commands
  InternalCommands = 'internal-commands',  // cost, env, insights, mock-limits, etc.
  OnboardingFlow = 'onboarding-flow',       // branded Noumena onboarding

  // Development / debug surfaces
  DevBar = 'dev-bar',                      // developer status bar
  PromptDumping = 'prompt-dumping',        // /dump-prompts
  RateLimitMocking = 'rate-limit-mocking',  // /mock-limits
  PluginManager = 'plugin-manager',        // experimental plugin system
}

export type CapabilitySet = Set<Capability>

export interface CapabilityContext {
  spin: Spin
  authProvider: AuthProvider
  accessMode: AccessMode
  isHomespace: boolean           // Running inside Noumena K8s namespace
  isProtectedNamespace: boolean  // ASL3+ / privileged namespace
}
```

### Resolution

```typescript
// code/src/capabilities/resolver.ts

import { Spin, AuthProvider, AccessMode, type CapabilityContext } from './types.js'

function resolveSpin(): Spin {
  const buildMode = process.env.NCODE_BUILD_MODE
  if (buildMode === 'noumena' || buildMode === 'n') {
    // Dev vs internal distinction: dev builds have a dev marker
    if (process.env.NCODE_BUILD_CHANNEL === 'dev') return Spin.Dev
    return Spin.Internal
  }
  const userType = process.env.USER_TYPE
  if (userType === 'ant') return Spin.Internal
  // External/public builds have no internal markers
  return Spin.Public
}

function resolveAuthProvider(): AuthProvider {
  if (process.env.NCODE_MANAGED_AUTH === '1') return AuthProvider.NoumenaManaged
  if (process.env.NCODE_API_KEY) return AuthProvider.NoumenaApiKey
  if (process.env.OPENAI_API_KEY && process.env.NCODE_BYOK_OPENAI === '1') {
    return AuthProvider.ByokOpenAI
  }
  if (process.env.ANTHROPIC_API_KEY) return AuthProvider.ByokAnthropic
  // Default for Noumena builds
  if (resolveSpin() !== Spin.Public) return AuthProvider.NoumenaManaged
  return AuthProvider.ByokAnthropic
}

function resolveAccessMode(): AccessMode {
  return process.env.CLAUDE_CODE_REMOTE === 'true'
    ? AccessMode.Remote
    : AccessMode.Direct
}

export function resolveCapabilityContext(): CapabilityContext {
  return {
    spin: resolveSpin(),
    authProvider: resolveAuthProvider(),
    accessMode: resolveAccessMode(),
    isHomespace: isRunningOnHomespace(),  // from envUtils.ts
    isProtectedNamespace: isInProtectedNamespace(),  // from envUtils.ts
  }
}
```

### Capability Matrix

```typescript
// code/src/capabilities/matrix.ts

import { Spin, AuthProvider, AccessMode, Capability } from './types.js'
import type { CapabilityContext, CapabilitySet } from './types.js'

function baseCapabilities(ctx: CapabilityContext): CapabilitySet {
  const caps = new Set<Capability>([
    Capability.PlanMode,
    Capability.PermissionModeCycling,
    Capability.BYOKAuth,
  ])

  if (ctx.accessMode === AccessMode.Direct) {
    caps.add(C capability.ModelProviderSelection)
  }

  return caps
}

function internalCapabilities(ctx: CapabilityContext): CapabilitySet {
  const caps = baseCapabilities(ctx)

  caps.add(Capability.Tungsten)
    .add(Capability.REPLTools)
    .add(Capability.Sandbox)
    .add(Capability.AgentTool)
    .add(Capability.AgentSwarms)
    .add(Capability.RemoteTriggers)
    .add(Capability.BackgroundPR)
    .add(Capability.BuddyMode)
    .add(Capability.ChromeMCP)
    .add(Capability.BrowserTools)
    .add(Capability.PlanVerification)
    .add(Capability.UltraPlan)
    .add(Capability.FirstPartyAnalytics)
    .add(Capability.FirstPartySessionTracing)
    .add(Capability.CustomEventLogging)
    .add(Capability.ManagedAuth)
    .add(Capability.ApiKeyAuth)
    .add(Capability.InternalCommands)
    .add(Capability.DevBar)
    .add(Capability.PromptDumping)
    .add(Capability.RateLimitMocking)
    .add(Capability.PluginManager)

  // Server-side proxy available only when platform services are reachable
  if (ctx.accessMode === AccessMode.Remote || ctx.isHomespace) {
    caps.add(Capability.ServerSideWebFetch)
    caps.add(Capability.ServerSideWebSearch)
  }

  return caps
}

function publicCapabilities(ctx: CapabilityContext): CapabilitySet {
  const caps = baseCapabilities(ctx)

  // Public builds use direct APIs by default
  caps.add(Capability.Sandbox)

  // Auth-dependent surfaces
  switch (ctx.authProvider) {
    case AuthProvider.NoumenaManaged:
      caps.add(Capability.ManagedAuth)
      caps.add(Capability.OnboardingFlow)
      caps.add(Capability.ServerSideWebFetch)
      caps.add(Capability.ServerSideWebSearch)
      break
    case AuthProvider.NoumenaApiKey:
      caps.add(Capability.ApiKeyAuth)
      caps.add(Capability.ServerSideWebFetch)
      caps.add(Capability.ServerSideWebSearch)
      break
    case AuthProvider.ByokAnthropic:
    case AuthProvider.ByokOpenAI:
      caps.add(Capability.BYOKAuth)
      // Web fetch stays client-side for BYOK to preserve privacy
      break
  }

  // Agent tools may be available for all authenticated users
  if (ctx.authProvider !== AuthProvider.ByokOpenAI) {
    caps.add(Capability.AgentTool)
  }

  // Analytics: only first-party events, no custom event logging
  caps.add(Capability.FirstPartyAnalytics)

  return caps
}

export function resolveCapabilities(ctx: CapabilityContext): CapabilitySet {
  switch (ctx.spin) {
    case Spin.Dev:
      // Dev = internal + extra debug surfaces
      return internalCapabilities(ctx)
    case Spin.Internal:
      return internalCapabilities(ctx)
    case Spin.Public:
      return publicCapabilities(ctx)
  }
}
```

### Public API

```typescript
// code/src/capabilities/index.ts

import { resolveCapabilityContext } from './resolver.js'
import { resolveCapabilities } from './matrix.js'
import { Capability, type CapabilitySet } from './types.js'

let _cachedSet: CapabilitySet | undefined
let _cachedKey: string | undefined

function cacheKey(): string {
  const ctx = resolveCapabilityContext()
  return `${ctx.spin}:${ctx.authProvider}:${ctx.accessMode}:${ctx.isHomespace}:${ctx.isProtectedNamespace}`
}

export function getCapabilities(): CapabilitySet {
  const key = cacheKey()
  if (_cachedSet && _cachedKey === key) return _cachedSet
  _cachedKey = key
  _cachedSet = resolveCapabilities(resolveCapabilityContext())
  return _cachedSet
}

export function hasCapability(capability: Capability): boolean {
  return getCapabilities().has(capability)
}

export function requireCapability(capability: Capability): void {
  if (!hasCapability(capability)) {
    throw new Error(
      `Capability ${capability} is not enabled for this ` +
        `spin/auth configuration. This is a configuration error — ` +
        `the caller should have gated this code path with hasCapability().`
    )
  }
}

export function assertAllCapabilities(capabilities: Capability[]): boolean {
  const set = getCapabilities()
  return capabilities.every(c => set.has(c))
}

export function assertAnyCapability(capabilities: Capability[]): boolean {
  const set = getCapabilities()
  return capabilities.some(c => set.has(c))
}

export { Capability, type CapabilitySet, type CapabilityContext } from './types.js'
```

## Migration Strategy

### Phase 1: Bootstrap (immediate)

1. Create `code/src/capabilities/` with `types.ts`, `resolver.ts`, and `matrix.ts`
2. Add `getCapabilities()` and `hasCapability()` exports
3. Update the existing `isNoumenaMode()` in `code/src/utils/noumenaMode.ts` to delegate to `hasCapability()`
4. Add a lint rule: **no inline `NCODE_BUILD_MODE` or `USER_TYPE` checks** outside `capabilities/resolver.ts`

### Phase 2: High-touch gates (week 1)

Replace gates in these high-impact files first:

| File | Gate Pattern | Replace With |
|------|-------------|-------------|
| `tools.ts` | Tool registration list | `hasCapability(Capability.X)` per tool |
| `commands.ts` | Command registration list | `hasCapability(Capability.InternalCommands)` |
| `main.tsx` | Startup behavior | `getCapabilities()` for feature init |
| `services/api/claude.ts` | API endpoint selection | `hasCapability(Capability.ServerSideWebFetch)` |
| `screens/REPL.tsx` | Surface enablement | `capabilitySet` passed to REPL config |
| `utils/permissions/*.ts` | Auto-mode / plan mode | `hasCapability(Capability.PlanMode)` |

### Phase 3: Sweep (week 2)

Mechanical replacement of remaining gates. Pattern:

```typescript
// BEFORE:
if ((process.env.NCODE_BUILD_MODE === 'noumena' || process.env.USER_TYPE === 'ant')) {
  enableInternalFeature()
}

// AFTER:
import { hasCapability, Capability } from '../capabilities/index.js'
if (hasCapability(Capability.InternalFeature)) {
  enableInternalFeature()
}
```

For branching behavior that depends on spin specifically (not just capability):

```typescript
import { getCapabilities, Capability, type CapabilityContext } from '../capabilities/index.js'
const ctx = resolveCapabilityContext()  // when spin-specific logic needed
if (ctx.spin === Spin.Public) {
  // public-specific path
}
```

### Phase 4: Cleanup (week 3)

1. Remove the `ncodeMode` / `noumenaMode` local helpers that are now delegated
2. Update tests to mock `resolveCapabilityContext()` instead of individual env vars
3. Add CI check: grep for `NCODE_BUILD_MODE` or `USER_TYPE` in `src/` → fail if found outside `capabilities/`

## Tree-Shaking & Dead Code Elimination

External/public builds should not ship internal-only code paths. The capability
system is designed to be DCE-friendly:

- `resolveSpin()` returns `Spin.Public` at build time for public binaries
- The `switch (ctx.spin)` in `resolveCapabilities()` resolves to a fixed set
- The compiler's DCE pass can eliminate `internalCapabilities()` entirely for
  public builds
- Tool and command imports gated by `hasCapability()` are inside `if` blocks —
  if the compiler can prove the `if` is always false, it eliminates the import

Build-time optimization (recommended):

```typescript
// At build time, bake the spin into the bundle
const BAKED_SPIN = process.env.NCODE_BUILD_MODE === 'noumena'
  ? (process.env.NCODE_BUILD_CHANNEL === 'dev' ? Spin.Dev : Spin.Internal)
  : Spin.Public

export function resolveSpin(): Spin {
  return BAKED_SPIN
}
```

This makes `BAKED_SPIN` a constant literal, allowing the bundler to fold away
the entire `internalCapabilities()` branch for public builds.

## Capability-to-Feature Mapping (Quick Reference)

| Feature / Surface | Required Capability |
|-------------------|--------------------|
| Tungsten tool | `Capability.Tungsten` |
| js_repl / py_repl | `Capability.REPLTools` |
| AgentTool, multi-agent UI | `Capability.AgentTool` |
| Agent swarms / teams | `Capability.AgentSwarms` |
| RemoteTriggerTool | `Capability.RemoteTriggers` |
| SuggestBackgroundPRTool | `Capability.BackgroundPR` |
| Buddy notification | `Capability.BuddyMode` |
| Chrome MCP | `Capability.ChromeMCP` |
| Plan mode, VerifyPlanExecution | `Capability.PlanMode`, `Capability.PlanVerification` |
| UltraPlan command | `Capability.UltraPlan` |
| /cost, /env, /insights | `Capability.InternalCommands` |
| /mock-limits, /dump-prompts | `Capability.RateLimitMocking`, `Capability.PromptDumping` |
| BigQuery / GrowthBook analytics | `Capability.FirstPartyAnalytics` |
| Server-side web_fetch | `Capability.ServerSideWebFetch` |
| Server-side web_search | `Capability.ServerSideWebSearch` |
| Noumena OAuth login | `Capability.ManagedAuth` |
| Noumena API key | `Capability.ApiKeyAuth` |
| BYOK (Anthropic / OpenAI) | `Capability.BYOKAuth` |
| DevBar component | `Capability.DevBar` |
| Experimental plugins | `Capability.PluginManager` |

## Open Questions

1. **Build-time vs runtime resolution**: Should the spin be fully baked at
   build time (eliminating runtime checks), or should dev/internal binaries
   support runtime override via env var? Recommendation: bake the spin,
   allow `NCODE_CAPABILITIES_OVERRIDE` for development only.

2. **Capability granularity**: Should `Capability.InternalCommands` be split
   into per-command capabilities (e.g., `Capability.CostCommand`), or is the
   coarse grouping sufficient? Recommendation: start coarse, split when a
   concrete use case demands it.

3. **Third-party tool gating**: MCP tools loaded from external servers should
   not use this capability model (they're user-configured). Only first-party
   tools and commands are gated.

4. **Auth provider fallback chain**: If a user starts with Noumena managed auth
   and then switches to BYOK Anthropic, capabilities must re-resolve. The
   current design caches per env-state hash; auth changes invalidate the cache
   via a reactive mechanism (TBD — likely triggered by `setAppState` on auth
   setters).

5. **Remote workspace capabilities**: Should `AccessMode.Remote` gate
   additional capabilities (like file-system access over SSH), or is that a
   separate concern handled by the remote session layer?

## Exit Criteria

- Zero inline `NCODE_BUILD_MODE` or `USER_TYPE` checks remain in `code/src/`
- All feature gating uses `hasCapability()` or `getCapabilities()`
- Public build binary size is unchanged or smaller (verified via `bun build`)
- Internal build passes all existing tests without behavioral changes
- New capability additions require only one file change (`matrix.ts`)
