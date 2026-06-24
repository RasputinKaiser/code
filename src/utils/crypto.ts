// Indirection point for the package.json "browser" field. When bun builds
// browser-sdk.js with --target browser, this file is swapped for
// crypto.browser.ts — avoiding a ~500KB crypto-browserify polyfill that Bun
// would otherwise inline for `import ... from 'crypto'`. Node/bun builds use
// this file unchanged.
//
// Bun's test/runtime loader is still touchy about re-exported Node builtin
// bindings from local modules. Export a thin wrapper instead of the imported
// binding directly so both build and test lanes can consume one stable symbol.
import { randomUUID as nodeRandomUUID } from 'crypto'

export function randomUUID(): string {
  return nodeRandomUUID()
}
