import { expect } from 'bun:test'
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'

type TextSnapshotSpec = {
  readonly snapshotFileUrl: URL
  readonly source: string
  readonly expression: string
  readonly value: string
}

function normalizeSnapshotText(text: string): string {
  return text.replace(/\r\n/g, '\n')
}

export function normalizeVisibleSurfaceText(text: string): string {
  return normalizeSnapshotText(text)
    .split('\n')
    .map(row => row.replace(/\s+$/g, ''))
    .join('\n')
    .replace(/\n+$/g, '')
}

export function formatTextSnapshot(spec: Omit<TextSnapshotSpec, 'snapshotFileUrl'>): string {
  const normalizedValue = normalizeSnapshotText(spec.value)
  const body = normalizedValue.endsWith('\n') ? normalizedValue : `${normalizedValue}\n`
  return `---\nsource: ${spec.source}\nexpression: ${spec.expression}\n---\n${body}`
}

export function expectTextSnapshot(spec: TextSnapshotSpec): void {
  const snapshotPath = fileURLToPath(spec.snapshotFileUrl)
  const actual = formatTextSnapshot(spec)
  if (process.env.UPDATE_TEXT_SNAPSHOTS === '1') {
    writeFileSync(snapshotPath, actual, 'utf8')
  }
  const expected = normalizeSnapshotText(readFileSync(snapshotPath, 'utf8'))
  expect(actual).toBe(expected)
}
