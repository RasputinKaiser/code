import React, { useEffect, useRef, useState } from 'react'
import { setTeleportedSessionInfo } from '../../bootstrap/state.js'
import { Spinner } from '../../components/Spinner.js'
import { TeleportProgress } from '../../components/TeleportProgress.js'
import { TeleportResumeWrapper } from '../../components/TeleportResumeWrapper.js'
import { Box, Text } from '../../ink.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import type { TeleportRemoteResponse } from '../../utils/conversationRecovery.js'
import { errorMessage, TeleportOperationError } from '../../utils/errors.js'
import {
  checkOutTeleportedSessionBranch,
  processMessagesForTeleportResume,
  type TeleportProgressStep,
  teleportResumeCodeSession,
} from '../../utils/teleport.js'

type TeleportCommandContext = Parameters<LocalJSXCommandCall>[1]
type TeleportOnDone = Parameters<LocalJSXCommandCall>[0]

function formatTeleportError(error: unknown): string {
  if (error instanceof TeleportOperationError) {
    return error.message
  }
  return errorMessage(error)
}

async function applyTeleportedMessages(
  result: TeleportRemoteResponse,
  context: TeleportCommandContext,
): Promise<void> {
  const { branchError } = await checkOutTeleportedSessionBranch(result.branch)
  const messages = processMessagesForTeleportResume(result.log, branchError)
  context.setMessages(() => messages)
}

function TeleportFromSessionId({
  sessionId,
  context,
  onDone,
}: {
  sessionId: string
  context: TeleportCommandContext
  onDone: TeleportOnDone
}): React.ReactNode {
  const [step, setStep] = useState<TeleportProgressStep>('validating')
  const hasStartedRef = useRef(false)

  useEffect(() => {
    if (hasStartedRef.current) {
      return
    }
    hasStartedRef.current = true
    let cancelled = false

    void (async () => {
      try {
        logEvent('ncode_teleport_resume_session', {
          source:
            'localCommand' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          session_id:
            sessionId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
        const result = await teleportResumeCodeSession(sessionId, nextStep => {
          if (!cancelled) {
            setStep(nextStep)
          }
        })
        if (cancelled) {
          return
        }

        setTeleportedSessionInfo({ sessionId })
        setStep('checking_out')
        await applyTeleportedMessages(result, context)
        if (cancelled) {
          return
        }

        setStep('done')
        onDone(undefined, { display: 'skip' })
      } catch (error) {
        if (cancelled) {
          return
        }
        onDone(`Teleport failed: ${formatTeleportError(error)}`, {
          display: 'user',
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [context, onDone, sessionId])

  return <TeleportProgress currentStep={step} sessionId={sessionId} />
}

function TeleportPicker({
  context,
  onDone,
}: {
  context: TeleportCommandContext
  onDone: TeleportOnDone
}): React.ReactNode {
  const [isApplying, setIsApplying] = useState(false)

  const handleComplete = (result: TeleportRemoteResponse): void => {
    setIsApplying(true)
    void (async () => {
      try {
        await applyTeleportedMessages(result, context)
        onDone(undefined, { display: 'skip' })
      } catch (error) {
        onDone(`Teleport failed: ${formatTeleportError(error)}`, {
          display: 'user',
        })
      }
    })()
  }

  if (isApplying) {
    return (
      <Box>
        <Spinner />
        <Text> Applying teleported session...</Text>
      </Box>
    )
  }

  return (
    <TeleportResumeWrapper
      source="localCommand"
      onComplete={handleComplete}
      onCancel={() => onDone('Teleport cancelled', { display: 'system' })}
      onError={(error, formattedMessage) =>
        onDone(formattedMessage ?? `Teleport failed: ${error}`, {
          display: 'user',
        })
      }
    />
  )
}

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  const sessionId = (args ?? '').trim()
  if (sessionId.length === 0) {
    return <TeleportPicker context={context} onDone={onDone} />
  }
  return (
    <TeleportFromSessionId sessionId={sessionId} context={context} onDone={onDone} />
  )
}
