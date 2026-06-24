import { afterEach, describe, expect, it, mock } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const resetModules = async () => {
  const envUtilsPath = import.meta.resolve('../../utils/envUtils.ts')
  const redrawPath = import.meta.resolve('../../session/replTranscriptResetRedraw.ts')
  mock.module(redrawPath, () => ({
    requestReplTranscriptResetRedraw: mock(() => {}),
  }))
  return {
    repaint: await import('./repaint.js'),
    redraw: await import('../../session/replTranscriptResetRedraw.js'),
    envUtils: await import(envUtilsPath),
  }
}

describe('selectObservedFrameRows', () => {
  it('compares the app frame against the top of the visible tmux pane', async () => {
    const { repaint } = await resetModules()
    const rows = repaint.selectObservedFrameRows(
      ['scrollback', 'front-0', 'front-1', 'front-2', ''].join('\n'),
      3,
      4,
    )

    expect(rows).toEqual(['front-0', 'front-1', 'front-2'])
  })
})

describe('/repaint command', () => {
  const originalConfigDir = process.env.NCODE_CONFIG_DIR
  const originalTmux = process.env.TMUX
  let tmpDir: string | undefined

  afterEach(() => {
    mock.restore()
    if (originalConfigDir === undefined) {
      delete process.env.NCODE_CONFIG_DIR
    } else {
      process.env.NCODE_CONFIG_DIR = originalConfigDir
    }
    if (originalTmux === undefined) {
      delete process.env.TMUX
    } else {
      process.env.TMUX = originalTmux
    }
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true })
      tmpDir = undefined
    }
  })

  it('writes a bounded before/after diagnostic artifact and requests a repaint', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ncode-repaint-test-'))
    process.env.NCODE_CONFIG_DIR = tmpDir
    delete process.env.TMUX
    const { repaint, redraw, envUtils } = await resetModules()
    envUtils.getCanonicalNcodeConfigHomeDir.cache?.clear?.()

    const result = await repaint.call('', {
      getAppState: () => ({ expandedView: 'transcript', verbose: true }),
      options: {},
    } as any)

    expect(result.type).toBe('text')
    expect(result.value).toContain('Repaint requested')
    const path = result.value.split('\n').at(-1)!
    expect(path.startsWith(join(tmpDir, 'debug', 'repaint'))).toBe(true)
    expect(existsSync(path)).toBe(true)
    expect(redraw.requestReplTranscriptResetRedraw).toHaveBeenCalledTimes(0)

    await Bun.sleep(120)

    const diagnostic = JSON.parse(readFileSync(path, 'utf8'))
    expect(diagnostic.kind).toBe('ncode-repaint-diagnostic')
    expect(diagnostic.before.phase).toBe('before')
    expect(diagnostic.after.phase).toBe('after')
    expect(diagnostic.before.appState).toEqual({ expandedView: 'transcript', verbose: true })
    expect(diagnostic.after.appState).toEqual({ expandedView: 'transcript', verbose: true })
    expect(diagnostic.before.rendererStructuralProbe.verdict).toBe('not_observed')
    expect(Array.isArray(diagnostic.before.rendererStructuralProbe.structuralDiffs)).toBe(true)
    expect(Array.isArray(diagnostic.before.rendererStructuralProbe.sources)).toBe(true)
    expect(redraw.requestReplTranscriptResetRedraw).toHaveBeenCalledTimes(1)
  })
})
