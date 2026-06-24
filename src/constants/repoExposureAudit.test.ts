import { describe, expect, it } from 'bun:test'
import {
  formatFindings,
  getDefaultAllowlist,
  runExposureAudit,
} from './repoExposureAudit.js'

describe('repo exposure audit', () => {
  it('has no high-confidence public release blockers in launch-critical paths', () => {
    const findings = runExposureAudit({ allowlist: getDefaultAllowlist() })
    if (findings.length > 0) {
      console.error(formatFindings(findings))
    }
    expect(findings).toEqual([])
  })
})
