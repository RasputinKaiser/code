import { describe, expect, it } from 'bun:test'

describe('WorkflowDetailDialog module', () => {
  it('loads successfully', async () => {
    const mod = await import('./WorkflowDetailDialog.js')
    expect(mod.WorkflowDetailDialog).toBeDefined()
  })
})
