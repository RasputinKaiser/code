import { useCallback, useEffect, type ComponentProps, type ReactNode } from 'react'
import PromptInput from '../components/PromptInput/PromptInput.js'
import { SessionBackgroundHint } from '../components/SessionBackgroundHint.js'
import { recordRenderTrace } from '../utils/renderTrace.js'
import type { PromptDraftController } from './promptDraftController.js'
import { usePromptDraftValue } from './promptDraftController.js'

type PromptInputProps = ComponentProps<typeof PromptInput>

type Props = {
  draftController: PromptDraftController
  onUserActivity: () => void
  renderLeadingChrome?: (
    inputValue: string,
    setInputValue: (value: string) => void,
  ) => ReactNode
  submitCount: number
  backgroundHint: {
    isLoading: boolean
    onBackgroundSession: () => void
  }
  promptInputProps: Omit<PromptInputProps, 'input' | 'onInputChange'>
}

export default function ReplPromptSurface({
  draftController,
  onUserActivity,
  renderLeadingChrome,
  submitCount,
  backgroundHint,
  promptInputProps,
}: Props): ReactNode {
  recordRenderTrace('ReplPromptSurface')
  const inputValue = usePromptDraftValue(draftController)
  const setInputValue = useCallback(
    (value: string) => {
      draftController.setValue(value)
    },
    [draftController],
  )

  useEffect(() => {
    onUserActivity()
  }, [inputValue, onUserActivity, submitCount])

  return (
    <>
      {renderLeadingChrome?.(inputValue, setInputValue)}
      <PromptInput
        {...promptInputProps}
        input={inputValue}
        onInputChange={setInputValue}
      />
      <SessionBackgroundHint
        onBackgroundSession={backgroundHint.onBackgroundSession}
        isLoading={backgroundHint.isLoading}
      />
    </>
  )
}
