import { afterEach, describe, expect, test } from 'bun:test'
import React from 'react'
import {
  cleanupMountedComponent,
  mountMountedComponent,
} from '../../../testing/mountedComponentHarness.js'
import {
  readMountedScreenText,
  readVisibleRows,
} from '../../../testing/replScreenContractHarness.js'
import { FileWriteToolDiff } from './FileWriteToolDiff.js'

afterEach(async () => {
  await cleanupMountedComponent()
})

describe('FileWriteToolDiff', () => {
  test('renders created markdown permission previews through the markdown renderer', async () => {
    const content = [
      '# Created Document',
      '',
      '| Name | Value | Notes |',
      '|---|---|',
      '| alpha | one',
      ' | wrapped note |',
    ].join('\n')

    const { ink } = await mountMountedComponent(
      <FileWriteToolDiff
        file_path="/tmp/generated.md"
        content={content}
        fileExists={false}
        oldContent=""
      />,
      {
        columns: 100,
        rows: 24,
      },
    )
    const visible = readMountedScreenText(ink)
    const rows = readVisibleRows(visible)

    expect(rows.some(row => row.includes('Created Document'))).toBe(true)
    expect(rows.some(row => row.includes('alpha'))).toBe(true)
    expect(rows.some(row => row.includes('wrapped note'))).toBe(true)
    expect(visible).not.toContain('|---|---|')
  })
})
