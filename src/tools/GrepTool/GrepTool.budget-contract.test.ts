import { afterEach, describe, expect, it } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'
import { getEmptyToolPermissionContext } from '../../Tool.js'
import {
  setFsImplementation,
  setOriginalFsImplementation,
} from '../../utils/fsOperations.js'
import { GrepTool } from './GrepTool.js'

describe('GrepTool.files_with_matches — execution budget contract', () => {
  let statCallCount = 0
  let tempDir = ''

  afterEach(() => {
    setOriginalFsImplementation()
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
    tempDir = ''
    statCallCount = 0
  })

  it('applies head_limit before stat work in files_with_matches mode', async () => {
    // Create a temp directory with 20 files, each containing the marker.
    tempDir = fs.mkdtempSync('/tmp/grep-budget-test-')
    for (let i = 0; i < 20; i++) {
      fs.writeFileSync(path.join(tempDir, `file-${i}.txt`), 'MARKER-TOKEN\n')
    }

    // Wrap fs.stat to count every call.
    const realFs = require('fs/promises')
    setFsImplementation({
      ...realFs,
      stat: async (p: string) => {
        statCallCount++
        return realFs.stat(p)
      },
    } as any)

    const result = await GrepTool.call(
      {
        pattern: 'MARKER-TOKEN',
        path: tempDir,
        output_mode: 'files_with_matches',
        head_limit: 5,
      },
      {
        abortController: new AbortController(),
        getAppState: () => ({
          toolPermissionContext: getEmptyToolPermissionContext(),
        }) as any,
      },
    )

    // Contract: execution budget (head_limit) must be applied before stat.
    // Otherwise broad searches create a stat storm before returning 5 paths.
    expect(statCallCount).toBeLessThanOrEqual(5)
    expect(result.data?.numFiles).toBe(5)
  })
})
