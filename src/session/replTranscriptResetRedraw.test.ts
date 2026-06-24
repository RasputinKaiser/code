import { afterEach, describe, expect, mock, test } from 'bun:test'
import { PassThrough } from 'stream'
import instances from '../ink/instances.js'
import { requestReplTranscriptResetRedraw } from './replTranscriptResetRedraw.js'

describe('requestReplTranscriptResetRedraw', () => {
  const stdout = new PassThrough() as NodeJS.WriteStream

  afterEach(() => {
    instances.delete(stdout)
  })

  test('forces a redraw when an Ink instance is registered for stdout', () => {
    const forceRedraw = mock(() => {})
    instances.set(stdout, { forceRedraw } as any)

    requestReplTranscriptResetRedraw(stdout)

    expect(forceRedraw).toHaveBeenCalledTimes(1)
    expect(forceRedraw).toHaveBeenCalledWith({ clearBeforePaint: true })
  })

  test('is a no-op when no Ink instance is registered', () => {
    expect(() => requestReplTranscriptResetRedraw(stdout)).not.toThrow()
  })
})
