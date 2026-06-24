import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'bun:test'
import {
  detectCitcWorkspaceSourceForPath,
  encodeWorkspaceId,
  parseCommitCloudRc,
  parseSaplingRepoName,
  parseWorkspaceStatus,
} from './citcWorkspaceSource.js'

describe('citcWorkspaceSource', () => {
  it('parses repo-local commit cloud receipts', () => {
    expect(
      parseCommitCloudRc(
        `[commitcloud]
current_workspace=user/xjdr/ncode-dev
locally_owned=False
`,
      ),
    ).toEqual({
      rawWorkspaceName: 'user/xjdr/ncode-dev',
      locallyOwned: false,
    })
  })

  it('parses Sapling repo identity from explicit reponame or mono default', () => {
    expect(
      parseSaplingRepoName(
        `[remotefilelog]
reponame=noumena/ncode
`,
      ),
    ).toBe('noumena/ncode')

    expect(
      parseSaplingRepoName(
        `[paths]
default=mono:noumena/platform
`,
      ),
    ).toBe('noumena/platform')
  })

  it('parses cloud status receipts into workspace metadata', () => {
    expect(
      parseWorkspaceStatus(
        `Raw Workspace Name: user/xjdr/ncode-dev
Workspace State: active
Workspace Version: 221
`,
      ),
    ).toEqual({
      rawWorkspaceName: 'user/xjdr/ncode-dev',
      workspaceVersion: 221,
      workspaceState: 'active',
    })
  })

  it('detects a CitC workspace source from local Sapling receipts', async () => {
    const root = mkdtempSync(join(tmpdir(), 'citc-workspace-source-'))
    try {
      mkdirSync(join(root, '.hg'), { recursive: true })
      writeFileSync(
        join(root, '.hg', 'commitcloudrc'),
        `[commitcloud]
current_workspace=user/xjdr/ncode-dev
locally_owned=False
`,
      )
      writeFileSync(
        join(root, '.hg', 'hgrc'),
        `[paths]
default=mono:noumena/ncode

[remotefilelog]
reponame=noumena/ncode
`,
      )
      mkdirSync(join(root, 'nested', 'src'), { recursive: true })

      const workspaceSource = await detectCitcWorkspaceSourceForPath(
        join(root, 'nested', 'src'),
        {
          getCloudStatus: async () => `Raw Workspace Name: user/xjdr/ncode-dev
Workspace State: active
Workspace Version: 221
`,
        },
      )

      expect(workspaceSource).toEqual({
        type: 'noumena_workspace',
        workspace_id: encodeWorkspaceId('noumena/ncode', 'user/xjdr/ncode-dev'),
        repo: 'noumena/ncode',
        raw_workspace_name: 'user/xjdr/ncode-dev',
        checkout_path: root,
        workspace_version: 221,
        workspace_state: 'active',
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
