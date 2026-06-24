import memoize from 'lodash-es/memoize.js'
import { join } from 'path'
import {
  getCurrentProjectConfig,
  saveCurrentProjectConfig,
} from './utils/config.js'
import { getCwd } from './utils/cwd.js'
import { isDirEmpty } from './utils/file.js'
import { getFsImplementation } from './utils/fsOperations.js'

export type Step = {
  key: string
  text: string
  isComplete: boolean
  isCompletable: boolean
  isEnabled: boolean
}

const PROJECT_INSTRUCTION_PATHS = [
  'AGENTS.md',
  'NCODE.md',
  'CLAUDE.md',
  join('.ncode', 'NCODE.md'),
  join('.claude', 'CLAUDE.md'),
]

export function getSteps(): Step[] {
  const hasProjectInstructions = PROJECT_INSTRUCTION_PATHS.some(path =>
    getFsImplementation().existsSync(join(getCwd(), path)),
  )
  const isWorkspaceDirEmpty = isDirEmpty(getCwd())

  return [
    {
      key: 'workspace',
      text: 'Ask Code to create a new app or clone a repository',
      isComplete: false,
      isCompletable: true,
      isEnabled: isWorkspaceDirEmpty,
    },
    {
      key: 'instructions',
      text: 'Run /init to create project instructions',
      isComplete: hasProjectInstructions,
      isCompletable: true,
      isEnabled: !isWorkspaceDirEmpty,
    },
  ]
}

export function isProjectOnboardingComplete(): boolean {
  return getSteps()
    .filter(({ isCompletable, isEnabled }) => isCompletable && isEnabled)
    .every(({ isComplete }) => isComplete)
}

export function maybeMarkProjectOnboardingComplete(): void {
  // Short-circuit on cached config — isProjectOnboardingComplete() hits
  // the filesystem, and REPL.tsx calls this on every prompt submit.
  if (getCurrentProjectConfig().hasCompletedProjectOnboarding) {
    return
  }
  if (isProjectOnboardingComplete()) {
    saveCurrentProjectConfig(current => ({
      ...current,
      hasCompletedProjectOnboarding: true,
    }))
  }
}

export const shouldShowProjectOnboarding = memoize((): boolean => {
  const projectConfig = getCurrentProjectConfig()
  // Short-circuit on cached config before isProjectOnboardingComplete()
  // hits the filesystem — this runs during first render.
  if (
    projectConfig.hasCompletedProjectOnboarding ||
    projectConfig.projectOnboardingSeenCount >= 4 ||
    process.env.IS_DEMO
  ) {
    return false
  }

  return !isProjectOnboardingComplete()
})

export function incrementProjectOnboardingSeenCount(): void {
  saveCurrentProjectConfig(current => ({
    ...current,
    projectOnboardingSeenCount: current.projectOnboardingSeenCount + 1,
  }))
}
