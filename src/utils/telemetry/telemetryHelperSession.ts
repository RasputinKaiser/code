import { getOtelHeadersFromHelper } from '../auth.js'

export function mergeTelemetryExporterHeaders(params: {
  staticHeaders: Record<string, string>
  dynamicHeaders: Record<string, string>
}): Record<string, string> {
  return {
    ...params.staticHeaders,
    ...params.dynamicHeaders,
  }
}

export function getCurrentTelemetryHelperHeaders(): Record<string, string> {
  return getOtelHeadersFromHelper()
}
