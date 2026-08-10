import { describe, expect, test } from 'bun:test'

import { getReasoningEffort } from '#core/utils/thinking'

describe('getReasoningEffort', () => {
  test('does not drop low effort profiles (0 is valid maxEffort)', async () => {
    const result = await getReasoningEffort({ reasoningEffort: 'low' }, [], {
      thinkingTokens: 5_000,
    })
    expect(result).toBe('low')
  })

  test('honors the explicit profile independently of thinking-token budgets', async () => {
    await expect(
      getReasoningEffort({ reasoningEffort: 'medium' }, [], {
        thinkingTokens: 40_000,
      }),
    ).resolves.toBe('medium')
    await expect(
      getReasoningEffort({ reasoningEffort: 'high' }, [], {
        thinkingTokens: 0,
      }),
    ).resolves.toBe('high')
  })

  test.each(['none', 'xhigh', 'max'] as const)(
    'supports the current OpenAI %s effort',
    async effort => {
      await expect(
        getReasoningEffort({ reasoningEffort: effort }, [], {
          thinkingTokens: 0,
        }),
      ).resolves.toBe(effort)
    },
  )
})
