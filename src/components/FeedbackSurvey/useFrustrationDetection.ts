import { randomUUID } from 'crypto'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isFeedbackSurveyDisabled } from 'src/services/analytics/config.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js'
import { hasFrictionSignal, isSessionContainerCompatible } from '../../hooks/useIssueFlagBanner.js'
import { isPolicyAllowed } from '../../services/policyLimits/index.js'
import type { Message as MessageType } from '../../types/message.js'
import { createAbortController } from '../../utils/abortController.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { toError } from '../../utils/errors.js'
import { logError } from '../../utils/log.js'
import {
  extractTag,
  extractTextContent,
  getLastAssistantMessage,
  getUserMessageText,
} from '../../utils/messages.js'
import { getSmallFastModel } from '../../utils/model/model.js'
import { getInitialSettings } from '../../utils/settings/settings.js'
import { sideQuery } from '../../utils/sideQuery.js'
import { logOTelEvent } from '../../utils/telemetry/events.js'
import { submitTranscriptShare } from './submitTranscriptShare.js'
import type { TranscriptShareResponse } from './TranscriptSharePrompt.js'

type FrustrationDetectionState =
  | 'closed'
  | 'transcript_prompt'
  | 'submitting'
  | 'submitted'

type FrustrationDetectionResult = {
  state: FrustrationDetectionState
  handleTranscriptSelect: (selected: TranscriptShareResponse) => void
}

type SessionQualityClassification = {
  isFrustrated: boolean
  hasPRRequest: boolean
}

const SESSION_QUALITY_CLASSIFIER_SYSTEM_PROMPT =
  'You are analyzing user messages from a conversation to detect certain features of the interaction.'

const SESSION_QUALITY_EVENT = 'ncode_feedback_survey_event'
const SESSION_QUALITY_OTEL_EVENT = 'feedback_survey'
const TRANSCRIPT_SHARE_TRIGGER = 'frustration'
const HIDE_SUBMITTED_AFTER_MS = 3000
const CLASSIFIER_MAX_USER_CHARS = 300
const FRUSTRATION_MIN_USER_TURNS = 3
const FRUSTRATION_COOLDOWN_MS = 30 * 60 * 1000
const DEFAULT_SESSION_QUALITY_RATE = 0.05

function getSessionQualityUserMessages(messages: MessageType[]): string[] {
  const userMessages: string[] = []

  for (const message of messages) {
    const text = getUserMessageText(message)
    if (!text?.trim()) {
      continue
    }
    userMessages.push(text.trim().slice(0, CLASSIFIER_MAX_USER_CHARS))
  }

  return userMessages
}

function formatSessionQualityPrompt(userMessages: string[]): string {
  const conversation = userMessages
    .map(message => `User: ${message}\nAsst: [response hidden]`)
    .join('\n')

  return `Analyze the following conversation between a user and an assistant (assistant responses are hidden).

${conversation}

Think step-by-step about:
1. Does the user seem frustrated at the Asst based on their messages? Look for signs like repeated corrections, negative language, etc.
2. Has the user explicitly asked to SEND/CREATE/PUSH a pull request to GitHub? This means they want to actually submit a PR to a repository, not just work on code together or prepare changes. Look for explicit requests like: "create a pr", "send a pull request", "push a pr", "open a pr", "submit a pr to github", etc. Do NOT count mentions of working on a PR together, preparing for a PR, or discussing PR content.

Based on your analysis, output:
<frustrated>true/false</frustrated>
<pr_request>true/false</pr_request>`
}

function parseSessionQualityClassification(
  responseText: string,
): SessionQualityClassification {
  const frustrated = extractTag(responseText, 'frustrated')
  const prRequest = extractTag(responseText, 'pr_request')

  return {
    isFrustrated: frustrated === 'true',
    hasPRRequest: prRequest === 'true',
  }
}

export function useFrustrationDetection(
  messages: MessageType[],
  isLoading: boolean,
  hasActivePrompt: boolean,
  hasVisibleSurvey: boolean,
): FrustrationDetectionResult {
  const [state, setState] = useState<FrustrationDetectionState>('closed')

  const isMountedRef = useRef(true)
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  const stateRef = useRef(state)
  stateRef.current = state

  const lastAssistantMessageIdRef = useRef('unknown')
  lastAssistantMessageIdRef.current =
    getLastAssistantMessage(messages)?.message?.id ?? 'unknown'

  const seenAssistantUuidsRef = useRef<Set<string>>(new Set())
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const classifierAbortRef = useRef<AbortController | null>(null)
  const lastPromptedAtRef = useRef(0)
  const appearanceIdRef = useRef<string | null>(null)
  const sessionVersionRef = useRef(0)

  // Keep the same two O(n) memoized scans the published ant path hinted at:
  // one to normalize user messages for the classifier, and one to cheaply gate
  // obviously ineligible transcripts before the API side-query.
  const classifierUserMessages = useMemo(
    () => getSessionQualityUserMessages(messages),
    [messages],
  )
  const shouldClassifyTranscript = useMemo(
    () =>
      isSessionContainerCompatible(messages) && hasFrictionSignal(messages),
    [messages],
  )
  const lastAssistant = useMemo(() => getLastAssistantMessage(messages), [messages])

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const closePrompt = useCallback(() => {
    clearCloseTimer()
    setState('closed')
    appearanceIdRef.current = null
  }, [clearCloseTimer])

  const showSubmittedThenClose = useCallback(() => {
    clearCloseTimer()
    setState('submitted')
    closeTimerRef.current = setTimeout(() => {
      setState('closed')
      appearanceIdRef.current = null
    }, HIDE_SUBMITTED_AFTER_MS)
  }, [clearCloseTimer])

  const handleTranscriptSelect = useCallback(
    (selected: TranscriptShareResponse): void => {
      const appearanceId = appearanceIdRef.current ?? randomUUID()
      appearanceIdRef.current = appearanceId

      logEvent(SESSION_QUALITY_EVENT, {
        event_type:
          `transcript_share_${selected}` as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        appearance_id:
          appearanceId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        last_assistant_message_id:
          lastAssistantMessageIdRef.current as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        trigger:
          TRANSCRIPT_SHARE_TRIGGER as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        survey_type:
          'session_quality' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })

      if (selected === 'dont_ask_again') {
        saveGlobalConfig(current => ({
          ...current,
          transcriptShareDismissed: true,
        }))
        closePrompt()
        return
      }

      if (selected === 'no') {
        closePrompt()
        return
      }

      setState('submitting')
      const sessionVersion = sessionVersionRef.current
      void (async () => {
        try {
          const result = await submitTranscriptShare(
            messagesRef.current,
            TRANSCRIPT_SHARE_TRIGGER,
            appearanceId,
          )

          if (
            !isMountedRef.current ||
            sessionVersion !== sessionVersionRef.current
          ) {
            return
          }

          logEvent(SESSION_QUALITY_EVENT, {
            event_type:
              (result.success
                ? 'transcript_share_submitted'
                : 'transcript_share_failed') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
            appearance_id:
              appearanceId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
            trigger:
              TRANSCRIPT_SHARE_TRIGGER as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
            survey_type:
              'session_quality' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          })

          if (result.success) {
            showSubmittedThenClose()
          } else {
            closePrompt()
          }
        } catch (error) {
          if (
            !isMountedRef.current ||
            sessionVersion !== sessionVersionRef.current
          ) {
            return
          }
          logError(toError(error))
          closePrompt()
        }
      })()
    },
    [closePrompt, showSubmittedThenClose],
  )

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      clearCloseTimer()
      classifierAbortRef.current?.abort()
      classifierAbortRef.current = null
    }
  }, [clearCloseTimer])

  useEffect(() => {
    if (messages.length !== 0) {
      return
    }

    clearCloseTimer()
    classifierAbortRef.current?.abort()
    classifierAbortRef.current = null
    seenAssistantUuidsRef.current.clear()
    lastPromptedAtRef.current = 0
    appearanceIdRef.current = null
    sessionVersionRef.current += 1
    setState('closed')
  }, [messages.length, clearCloseTimer])

  useEffect(() => {
    if (!lastAssistant) {
      return
    }
    if (state !== 'closed' || isLoading || hasActivePrompt || hasVisibleSurvey) {
      return
    }
    if (getGlobalConfig().transcriptShareDismissed) {
      return
    }
    if (!isPolicyAllowed('allow_product_feedback')) {
      return
    }
    if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY)) {
      return
    }
    if (isFeedbackSurveyDisabled()) {
      return
    }

    const assistantUuid = lastAssistant.uuid
    if (seenAssistantUuidsRef.current.has(assistantUuid)) {
      return
    }

    // Treat each completed assistant turn as one opportunity. Mark it handled
    // once we know whether it should classify, so we don't repeatedly re-query
    // the same turn on unrelated renders.
    if (!shouldClassifyTranscript) {
      seenAssistantUuidsRef.current.add(assistantUuid)
      return
    }

    const userTurnCount = classifierUserMessages.length
    if (userTurnCount < FRUSTRATION_MIN_USER_TURNS) {
      seenAssistantUuidsRef.current.add(assistantUuid)
      return
    }

    const now = Date.now()
    if (now - lastPromptedAtRef.current < FRUSTRATION_COOLDOWN_MS) {
      seenAssistantUuidsRef.current.add(assistantUuid)
      return
    }

    const probability =
      getInitialSettings().feedbackSurveyRate ?? DEFAULT_SESSION_QUALITY_RATE
    if (Math.random() > probability) {
      seenAssistantUuidsRef.current.add(assistantUuid)
      return
    }

    const prompt = formatSessionQualityPrompt(classifierUserMessages)
    const controller = createAbortController()
    classifierAbortRef.current?.abort()
    classifierAbortRef.current = controller
    seenAssistantUuidsRef.current.add(assistantUuid)

    void (async () => {
      try {
        const response = await sideQuery({
          querySource: 'session_quality_classifier',
          model: getSmallFastModel(),
          system: SESSION_QUALITY_CLASSIFIER_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: prompt }],
          thinking: false,
          skipSystemPromptPrefix: true,
          signal: controller.signal,
        })

        if (controller.signal.aborted) {
          return
        }

        const content = extractTextContent(response.content, '\n').trim()
        const result = parseSessionQualityClassification(content)

        if (result.isFrustrated || result.hasPRRequest) {
          // Match the published classifier behavior: queryMessageCount comes
          // from the number of API prompt messages, which is always 1 here.
          logEvent('ncode_session_quality_classification', {
            uuid:
              assistantUuid as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
            isFrustrated: result.isFrustrated ? 1 : 0,
            hasPRRequest: result.hasPRRequest ? 1 : 0,
            messageCount: 1,
          })
        }

        if (!result.isFrustrated) {
          return
        }
        if (stateRef.current !== 'closed') {
          return
        }
        if (getGlobalConfig().transcriptShareDismissed) {
          return
        }
        if (!isPolicyAllowed('allow_product_feedback')) {
          return
        }

        lastPromptedAtRef.current = Date.now()
        const appearanceId = randomUUID()
        appearanceIdRef.current = appearanceId
        setState('transcript_prompt')

        logEvent(SESSION_QUALITY_EVENT, {
          event_type:
            'transcript_prompt_appeared' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          appearance_id:
            appearanceId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          last_assistant_message_id:
            lastAssistantMessageIdRef.current as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          trigger:
            TRANSCRIPT_SHARE_TRIGGER as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          survey_type:
            'session_quality' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
        void logOTelEvent(SESSION_QUALITY_OTEL_EVENT, {
          event_type: 'transcript_prompt_appeared',
          appearance_id: appearanceId,
          survey_type: 'session_quality',
        })
      } catch (error) {
        if (!controller.signal.aborted) {
          logError(toError(error))
        }
      } finally {
        if (classifierAbortRef.current === controller) {
          classifierAbortRef.current = null
        }
      }
    })()
  }, [
    classifierUserMessages,
    hasActivePrompt,
    hasVisibleSurvey,
    isLoading,
    lastAssistant,
    messages.length,
    shouldClassifyTranscript,
    state,
  ])

  return {
    state,
    handleTranscriptSelect,
  }
}
