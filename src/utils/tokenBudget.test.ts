import { describe, expect, it } from 'bun:test'

import {
  findTokenBudgetPositions,
  getBudgetContinuationMessage,
  parseTokenBudget,
} from './tokenBudget.js'

describe('parseTokenBudget', () => {
  it('accepts shorthand budgets at the start of the input', () => {
    expect(parseTokenBudget('+500k keep going')).toBe(500_000)
  })

  it('accepts shorthand budgets at the end of the input', () => {
    expect(parseTokenBudget('keep going +1.5m')).toBe(1_500_000)
  })

  it('accepts verbose use/spend token instructions', () => {
    expect(parseTokenBudget('please use 2m tokens for this')).toBe(2_000_000)
    expect(parseTokenBudget('spend 3k tokens if needed')).toBe(3_000)
  })

  it('does not treat unrelated numbers as a token budget', () => {
    expect(parseTokenBudget('we changed 2m lines today')).toBeNull()
    expect(parseTokenBudget('budget is 500k dollars')).toBeNull()
  })
})

describe('findTokenBudgetPositions', () => {
  it('returns the single shorthand span without double-counting bare input', () => {
    expect(findTokenBudgetPositions('+500k')).toEqual([{ start: 0, end: 5 }])
  })

  it('finds trailing shorthand spans', () => {
    const text = 'keep going +1.5m'
    const positions = findTokenBudgetPositions(text)

    expect(positions).toEqual([{ start: 11, end: 16 }])
    expect(positions.map(({ start, end }) => text.slice(start, end))).toEqual([
      '+1.5m',
    ])
  })

  it('finds every verbose token-budget instruction', () => {
    const text = 'please use 2m tokens now, then spend 3k tokens later'
    const positions = findTokenBudgetPositions(text)

    expect(positions).toEqual([
      { start: 7, end: 20 },
      { start: 31, end: 46 },
    ])
    expect(positions.map(({ start, end }) => text.slice(start, end))).toEqual([
      'use 2m tokens',
      'spend 3k tokens',
    ])
  })
})

describe('getBudgetContinuationMessage', () => {
  it('keeps the continuation instruction explicit and formatted', () => {
    const message = getBudgetContinuationMessage(95, 12_345, 67_890)

    expect(message).toContain('95%')
    expect(message).toContain('12,345 / 67,890')
    expect(message).toContain('do not summarize')
  })
})
