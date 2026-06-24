import { describe, expect, it } from 'bun:test'
import {
  matchesKeepGoingKeyword,
  matchesNegativeKeyword,
} from './userPromptKeywords.js'

describe('matchesNegativeKeyword', () => {
  it('detects common frustration phrases regardless of case', () => {
    expect(matchesNegativeKeyword('wtf is this')).toBe(true)
    expect(matchesNegativeKeyword('This is so frustrating')).toBe(true)
    expect(matchesNegativeKeyword('FUCKING broken again')).toBe(true)
  })

  it('does not flag neutral prompts that merely contain other punctuation or words', () => {
    expect(matchesNegativeKeyword('what the architecture looks like')).toBe(
      false,
    )
    expect(matchesNegativeKeyword('please continue')).toBe(false)
  })
})

describe('matchesKeepGoingKeyword', () => {
  it('treats a bare continue prompt as a continuation request', () => {
    expect(matchesKeepGoingKeyword('continue')).toBe(true)
    expect(matchesKeepGoingKeyword('  continue  ')).toBe(true)
  })

  it('accepts keep-going phrases embedded in a larger message', () => {
    expect(matchesKeepGoingKeyword('keep going with the refactor')).toBe(true)
    expect(matchesKeepGoingKeyword('go on, show me the next step')).toBe(true)
  })

  it('does not misclassify words that only contain continue as a substring', () => {
    expect(matchesKeepGoingKeyword('continued')).toBe(false)
    expect(matchesKeepGoingKeyword('continue please')).toBe(false)
  })
})
