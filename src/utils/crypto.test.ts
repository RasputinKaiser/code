import { describe, expect, it } from 'bun:test'

import { randomUUID as randomUUIDFromJs } from './crypto.js'
import { randomUUID as randomUUIDFromTs } from './crypto.ts'

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

describe('randomUUID wrapper', () => {
  it('keeps the TypeScript wrapper callable under Bun test', () => {
    expect(randomUUIDFromTs()).toMatch(UUID_V4_RE)
  })

  it('keeps the JavaScript wrapper callable for .js importers', () => {
    expect(randomUUIDFromJs()).toMatch(UUID_V4_RE)
  })
})
