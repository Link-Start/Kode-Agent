import { describe, expect, test } from 'bun:test'

import { resolveReasoningEffort } from './reasoningEffort'

describe('resolveReasoningEffort', () => {
  test('keeps low effort (0) instead of treating it as missing', () => {
    expect(
      resolveReasoningEffort({
        modelProfile: { reasoningEffort: 'low' },
        thinkingTokens: 5_000,
      }),
    ).toBe('low')
  })

  test('honors explicit profiles independently of thinking-token budgets', () => {
    expect(
      resolveReasoningEffort({
        modelProfile: { reasoningEffort: 'medium' },
        thinkingTokens: 40_000,
      }),
    ).toBe('medium')
    expect(
      resolveReasoningEffort({
        modelProfile: { reasoningEffort: 'high' },
        thinkingTokens: 40_000,
      }),
    ).toBe('high')
    expect(
      resolveReasoningEffort({
        modelProfile: { reasoningEffort: 'high' },
        thinkingTokens: 5_000,
      }),
    ).toBe('high')
  })

  test.each(['none', 'xhigh', 'max'] as const)(
    'supports the current OpenAI %s effort',
    effort => {
      expect(
        resolveReasoningEffort({
          modelProfile: { reasoningEffort: effort },
          thinkingTokens: 0,
        }),
      ).toBe(effort)
    },
  )
})
