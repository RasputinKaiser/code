import type { AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS } from 'src/services/analytics/index.js'
import type { ResumeEntrypoint } from '../types/session.js'

export type ReplResumeSuccessEvent = {
  entrypoint: AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
  success: true
  resume_duration_ms: number
}

export type ReplResumeFailureEvent = {
  entrypoint: AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
  success: false
}

export type DispatchReplResumeOrchestrationOptions = {
  entrypoint: ResumeEntrypoint
}

export type DispatchReplResumeOrchestrationDeps = {
  nowMs: () => number
  runPreparation: () => Promise<void>
  runSessionSwitch: () => Promise<void>
  runFinalize: () => void | Promise<void>
  logResumeEvent: (event: ReplResumeSuccessEvent | ReplResumeFailureEvent) => void
}

export async function dispatchReplResumeOrchestration(
  options: DispatchReplResumeOrchestrationOptions,
  deps: DispatchReplResumeOrchestrationDeps,
): Promise<void> {
  const resumeStart = deps.nowMs()
  try {
    await deps.runPreparation()
    await deps.runSessionSwitch()
    await deps.runFinalize()

    deps.logResumeEvent({
      entrypoint:
        options.entrypoint as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      success: true,
      resume_duration_ms: Math.round(deps.nowMs() - resumeStart),
    })
  } catch (error) {
    deps.logResumeEvent({
      entrypoint:
        options.entrypoint as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      success: false,
    })
    throw error
  }
}
