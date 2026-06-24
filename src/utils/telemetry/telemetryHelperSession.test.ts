import { describe, expect, it } from 'bun:test'

import { mergeTelemetryExporterHeaders } from './telemetryHelperSession.js'

describe('mergeTelemetryExporterHeaders', () => {
  it('preserves static headers when there are no dynamic overrides', () => {
    expect(
      mergeTelemetryExporterHeaders({
        staticHeaders: {
          a: '1',
        },
        dynamicHeaders: {},
      }),
    ).toEqual({
      a: '1',
    })
  })

  it('lets dynamic helper headers override static headers by key', () => {
    expect(
      mergeTelemetryExporterHeaders({
        staticHeaders: {
          a: '1',
          b: '2',
        },
        dynamicHeaders: {
          b: '3',
          c: '4',
        },
      }),
    ).toEqual({
      a: '1',
      b: '3',
      c: '4',
    })
  })
})
