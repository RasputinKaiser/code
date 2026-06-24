import * as React from 'react'
import { Onboarding } from '../../components/Onboarding.js'
import { completeOnboarding } from '../../interactiveHelpers.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { handleAuthChangeInCommand } from '../../utils/postAuthFlow.js'

export const call: LocalJSXCommandCall = async (onDone, context) => {
  return (
    <Onboarding
      onDone={() => {
        completeOnboarding()
        handleAuthChangeInCommand(context)
        onDone('Onboarding complete', {
          display: 'system',
        })
      }}
    />
  )
}
