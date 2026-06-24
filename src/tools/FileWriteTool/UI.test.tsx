import { afterEach, describe, expect, test } from 'bun:test'
import React from 'react'
import { cleanupMountedComponent, mountMountedComponent } from '../../testing/mountedComponentHarness.js'
import { readMountedScreenText, readVisibleRows } from '../../testing/replScreenContractHarness.js'
import { renderToolResultMessage } from './UI.js'

afterEach(async () => {
  await cleanupMountedComponent()
})

describe('FileWriteTool renderToolResultMessage', () => {
  test('renders created markdown files through the markdown renderer', async () => {
    const content = [
      '# Created Document',
      '',
      '| Name | Value | Notes |',
      '|---|---|',
      '| alpha | one',
      ' | wrapped note |',
    ].join('\n')
    const node = renderToolResultMessage(
      {
        type: 'create',
        filePath: '/tmp/generated.md',
        content,
        structuredPatch: [],
        originalFile: null,
      },
      [],
      { verbose: true },
    )

    const { ink } = await mountMountedComponent(node, {
      columns: 100,
      rows: 24,
    })
    const visible = readMountedScreenText(ink)
    const rows = readVisibleRows(visible)

    expect(rows.some(row => row.includes('Created Document'))).toBe(true)
    expect(rows.some(row => row.includes('alpha'))).toBe(true)
    expect(rows.some(row => row.includes('wrapped note'))).toBe(true)
    expect(visible).not.toContain('|---|---|')
  })
})
